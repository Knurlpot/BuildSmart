import re
from pathlib import Path

import pandas as pd
import pdfplumber

REQUIRED_COLUMNS = {"raw_name", "raw_unit", "raw_price"}

# Small, explicit synonym list — not fuzzy/NLP matching. Real DPWH/PSA/supplier
# files use human column headers, not these literal field names; this covers
# common variants so files don't have to be manually renamed first. Matching is
# case/whitespace-insensitive; first match wins if multiple columns could map
# to the same canonical name. No column-mapping UI exists here (unlike the old
# manual-upload tab's ColumnMappingStep) — anything not in this list still
# needs to literally be named raw_name/raw_unit/raw_price.
COLUMN_SYNONYMS: dict[str, set[str]] = {
    "raw_name": {
        "name", "material", "material name", "material description",
        "item name", "item description", "description",
    },
    "raw_unit": {"unit", "uom", "unit of measure"},
    "raw_price": {"price", "unit price", "unit cost", "cost", "amount"},
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    lookup = {
        synonym: canonical for canonical, synonyms in COLUMN_SYNONYMS.items() for synonym in synonyms
    }

    rename_map = {}
    for col in df.columns:
        # Collapse embedded newlines (PDF headers often wrap across two lines
        # within one cell, e.g. "Unit\nPrice") into a single space before
        # matching, and try again with a trailing parenthetical annotation
        # stripped (e.g. "Price (PHP)" -> "price") — real price lists commonly
        # tack a currency/unit hint onto an otherwise-recognized header.
        key = re.sub(r"\s+", " ", str(col)).strip().lower()
        if key in REQUIRED_COLUMNS:
            continue
        stripped_key = re.sub(r"\s*\([^)]*\)\s*$", "", key).strip()
        canonical = lookup.get(key) or lookup.get(stripped_key)
        if canonical and canonical not in df.columns and canonical not in rename_map.values():
            rename_map[col] = canonical

    return df.rename(columns=rename_map)


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
                current_header = [str(cell or "").strip() for cell in table[0]]
                if header is None:
                    header = current_header
                    body = table[1:]
                elif current_header == header:
                    body = table[1:]  # repeated header row on a later page/table
                else:
                    body = table
                rows.extend(body)

    if header is None:
        raise ValueError("No table found in PDF price list")

    df = pd.DataFrame(rows, columns=header)
    df = df.map(lambda cell: cell.strip() if isinstance(cell, str) else cell)
    return df


def parse_pricelist_file(file_path: str) -> pd.DataFrame:
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

    df = _normalize_columns(df)

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Price list file is missing required column(s): {sorted(missing)}")

    if not pd.api.types.is_numeric_dtype(df["raw_price"]):
        # pandas 3.x infers a proper string dtype (not the legacy numpy
        # `object` dtype) for text columns like PDF-extracted cells, so
        # checking dtype == object here would miss them entirely.
        df["raw_price"] = pd.to_numeric(df["raw_price"], errors="coerce")

    return df
