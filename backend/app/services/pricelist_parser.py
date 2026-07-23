import re
from pathlib import Path

import pandas as pd
import pdfplumber

REQUIRED_COLUMNS = {"raw_name", "raw_unit", "raw_price"}


class MissingColumnsError(ValueError):
    """Raised when tiers 1-3 (exact/synonym/keyword) can't place every required
    column. Carries enough for a human to resolve it via a mapping UI instead
    of the parser guessing from cell content — see ColumnMappingStep.tsx."""

    def __init__(
        self,
        missing_columns: list[str],
        available_columns: list[str],
        detected_mapping: dict[str, str],
        preview_rows: list[dict],
    ) -> None:
        super().__init__(f"Price list file is missing required column(s): {missing_columns}")
        self.missing_columns = missing_columns
        self.available_columns = available_columns
        self.detected_mapping = detected_mapping
        self.preview_rows = preview_rows

# Explicit synonym list, checked first because it's the least likely to
# misfire. Real DPWH/PSA/supplier files use human column headers, not these
# literal field names; this covers common variants so files don't have to be
# manually renamed first. Matching is case/whitespace-insensitive; first
# match wins if multiple columns could map to the same canonical name.
# Anything not covered here falls through to the looser tiers below
# (_KEYWORD_HINTS, then content-based inference) rather than failing outright.
COLUMN_SYNONYMS: dict[str, set[str]] = {
    "raw_name": {
        "name", "material", "material name", "material description",
        "item name", "item description", "description", "product",
        "product name", "product description", "particulars", "commodity",
    },
    "raw_unit": {
        "unit", "uom", "unit of measure", "unit of measurement",
        "measure", "measurement", "packaging",
    },
    "raw_price": {
        "price", "unit price", "unit cost", "cost", "amount", "rate",
        "unit rate", "selling price", "srp", "value",
    },
}

# Looser fallback for headers the synonym list doesn't cover exactly — matched
# by substring containment instead of full-header equality, e.g. "Approx. Unit
# Cost 2026" still hits "cost". Checked in this order (price, then unit, then
# name) because "price"/"cost"/"rate" are unambiguous, while "name" is broad
# enough to false-positive on an identifier column like "Material ID" if it
# were checked against every column instead of only what's left unclaimed.
_KEYWORD_HINTS: dict[str, tuple[str, ...]] = {
    "raw_price": ("price", "cost", "amount", "rate", "value", "peso"),
    "raw_unit": ("unit", "uom", "measure", "pack"),
    "raw_name": ("name", "desc", "item", "material", "product", "particular", "commodity"),
}

# Columns whose header identifies them as an ID/code/index rather than actual
# data — excluded from the keyword fallback tier so "Material ID" never gets
# mistaken for the name column just because it contains "material".
_IDENTIFIER_HEADER_RE = re.compile(r"\b(id|code|sku|no|number)\b|#")


_TRAILING_CURRENCY_RE = re.compile(r"\s+(php|usd|eur|gbp|jpy)$")


def _header_key(col: object) -> str:
    # Collapse embedded newlines (PDF headers often wrap across two lines
    # within one cell, e.g. "Unit\nPrice") and underscores (spreadsheet
    # exports commonly use "Item_Name" / "Unit_Price_PHP") into a single
    # space before matching.
    return re.sub(r"[\s_]+", " ", str(col)).strip().lower()


def _dedupe_and_label_columns(df: pd.DataFrame) -> pd.DataFrame:
    # A blank or duplicate header (both seen from real pdfplumber extractions —
    # a merged banner cell, or a repeated ruling line read as an extra empty
    # column) isn't something a human can pick out of a mapping dropdown, so
    # give every column a distinct, non-empty label before anything downstream
    # (matching or the mapping UI) has to reference it by name.
    seen: dict[str, int] = {}
    labels = []
    for i, col in enumerate(df.columns):
        label = str(col).strip() or f"Column {i + 1}"
        if label in seen:
            seen[label] += 1
            label = f"{label} ({seen[label]})"
        else:
            seen[label] = 1
        labels.append(label)
    df = df.copy()
    df.columns = labels
    return df


def _synonym_rename_map(df: pd.DataFrame) -> dict:
    lookup = {
        synonym: canonical for canonical, synonyms in COLUMN_SYNONYMS.items() for synonym in synonyms
    }

    rename_map = {}
    for col in df.columns:
        key = _header_key(col)
        if key in REQUIRED_COLUMNS:
            continue
        # Try again with a trailing currency annotation stripped — either
        # parenthetical ("Price (PHP)") or bare ("Unit_Price_PHP") — real
        # price lists commonly tack a currency/unit hint onto an otherwise-
        # recognized header.
        stripped_key = re.sub(r"\s*\([^)]*\)\s*$", "", key).strip()
        stripped_key = _TRAILING_CURRENCY_RE.sub("", stripped_key).strip()
        canonical = lookup.get(key) or lookup.get(stripped_key)
        if canonical and canonical not in df.columns and canonical not in rename_map.values():
            rename_map[col] = canonical

    return rename_map


def _looks_like_identifier(header_key: str) -> bool:
    return bool(_IDENTIFIER_HEADER_RE.search(header_key))


def _keyword_fallback_match(df: pd.DataFrame, unclaimed: list, missing: set[str]) -> dict:
    rename_map: dict = {}
    for canonical in ("raw_price", "raw_unit", "raw_name"):
        if canonical not in missing:
            continue
        for col in unclaimed:
            if col in rename_map:
                continue
            key = _header_key(col)
            if _looks_like_identifier(key):
                continue
            if any(hint in key for hint in _KEYWORD_HINTS[canonical]):
                rename_map[col] = canonical
                break
    return rename_map


def _known_header_hits(row: list[str]) -> int:
    known_keys = REQUIRED_COLUMNS | {
        synonym for synonyms in COLUMN_SYNONYMS.values() for synonym in synonyms
    }
    hits = 0
    for cell in row:
        key = _header_key(cell)
        stripped_key = _TRAILING_CURRENCY_RE.sub(
            "", re.sub(r"\s*\([^)]*\)\s*$", "", key).strip()
        ).strip()
        if key in known_keys or stripped_key in known_keys:
            hits += 1
    return hits


def _parse_pdf(path: Path) -> pd.DataFrame:
    # Relies on pdfplumber detecting an actual ruled/gridded table in the PDF
    # (as DPWH/PSA/supplier price-list PDFs typically have) — this is not OCR
    # and won't extract a table from a plain text layout or a scanned image.
    rows: list[list[str]] = []
    header: list[str] | None = None

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table:
                    continue
                cleaned = [[str(cell or "").strip() for cell in row] for row in table]
                if header is None:
                    # A title/date banner above the table is sometimes merged
                    # into the same extracted table as row 0 (e.g. a report
                    # header spanning the full width) — scan for the first
                    # row that actually looks like a header instead of
                    # assuming row 0 is it.
                    header_idx = next(
                        (i for i, r in enumerate(cleaned) if _known_header_hits(r) >= 2),
                        0,
                    )
                    header = cleaned[header_idx]
                    body = cleaned[header_idx + 1 :]
                elif cleaned[0] == header:
                    body = cleaned[1:]  # repeated header row on a later page/table
                else:
                    body = cleaned
                rows.extend(body)

    if header is None:
        raise ValueError("No table found in PDF price list")

    df = pd.DataFrame(rows, columns=header)
    df = df.map(lambda cell: cell.strip() if isinstance(cell, str) else cell)
    return df


def parse_pricelist_file(file_path: str, column_mapping: dict[str, str] | None = None) -> pd.DataFrame:
    """column_mapping, when given, is canonical -> original header (e.g.
    {"raw_name": "Full Item Description", ...}) — a human-confirmed mapping
    from ColumnMappingStep.tsx, taking precedence over auto-detection so a
    file that tiers 1-3 couldn't place doesn't need a second guess."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    elif suffix == ".pdf":
        df = _parse_pdf(path)
    else:
        raise ValueError(f"Unsupported price list file type: {suffix!r}")

    df = _dedupe_and_label_columns(df)

    if column_mapping is not None:
        unknown = set(column_mapping.values()) - set(df.columns)
        if unknown:
            raise ValueError(f"Column mapping references column(s) not found in file: {sorted(unknown)}")
        missing_fields = REQUIRED_COLUMNS - set(column_mapping.keys())
        if missing_fields:
            raise ValueError(f"Column mapping is missing required field(s): {sorted(missing_fields)}")
        df = df.rename(columns={original: canonical for canonical, original in column_mapping.items()})
    else:
        original_columns = list(df.columns)
        preview_rows = df.head(5).astype(str).to_dict(orient="records")

        rename_map = _synonym_rename_map(df)
        df = df.rename(columns=rename_map)

        missing = REQUIRED_COLUMNS - set(df.columns)
        if missing:
            unclaimed = [c for c in df.columns if c not in REQUIRED_COLUMNS]
            keyword_map = _keyword_fallback_match(df, unclaimed, missing)
            rename_map.update(keyword_map)
            df = df.rename(columns=keyword_map)
            missing = REQUIRED_COLUMNS - set(df.columns)

        if missing:
            # raw_name has no safe way to guess past this point: unlike price
            # (numeric-heavy) or unit (small vocabulary), there's no reliable
            # cell-content signal for "this is the item name" — the wrong
            # guess would silently mislabel e.g. a Category column as the
            # item name. Surface what tiers 1-3 DID resolve plus every raw
            # header so ColumnMappingStep.tsx can let a human finish it.
            detected_mapping = {canonical: original for original, canonical in rename_map.items()}
            raise MissingColumnsError(
                missing_columns=sorted(missing),
                available_columns=original_columns,
                detected_mapping=detected_mapping,
                preview_rows=preview_rows,
            )

    if not pd.api.types.is_numeric_dtype(df["raw_price"]):
        # pandas 3.x infers a proper string dtype (not the legacy numpy
        # `object` dtype) for text columns like PDF-extracted cells, so
        # checking dtype == object here would miss them entirely. Real PDF
        # price lists commonly format four-figure prices with a thousands
        # separator (e.g. "4,200.00") — strip it before coercion, or
        # to_numeric silently turns the whole cell into NaN.
        cleaned_price = df["raw_price"].astype(str).str.replace(",", "", regex=False)
        df["raw_price"] = pd.to_numeric(cleaned_price, errors="coerce")

    # Drop blank rows (e.g. a footer/page-break artifact picked up as an
    # extra table row) — an empty raw_name isn't a real line item and would
    # otherwise surface as a garbage entry in the review queue.
    df = df[df["raw_name"].astype(str).str.strip() != ""].reset_index(drop=True)

    return df
