import re
import shutil
from pathlib import Path
from typing import Any, Mapping

import pandas as pd
import pdfplumber

REQUIRED_COLUMNS = {"raw_name", "raw_unit", "raw_price"}


def _poppler_path() -> str | None:
    for candidate in (shutil.which("pdftoppm"), "/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"):
        if candidate and Path(candidate).exists():
            return str(Path(candidate).parent)
    return None


def _configure_tesseract(pytesseract_module: Any) -> None:
    for candidate in (shutil.which("tesseract"), "/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"):
        if candidate and Path(candidate).exists():
            tesseract_config = getattr(pytesseract_module, "pytesseract", None)
            if tesseract_config is not None:
                tesseract_config.tesseract_cmd = candidate
            return


def _convert_pdf_to_images(convert_from_path: Any, path: Path, *, dpi: int) -> list[Any]:
    try:
        return convert_from_path(str(path), dpi=dpi, poppler_path=_poppler_path())
    except TypeError:
        return convert_from_path(str(path), dpi=dpi)

# Small, explicit synonym list — not fuzzy/NLP matching. Real DPWH/PSA/supplier
# files use human column headers, not these literal field names; this covers
# common variants so files don't have to be manually renamed first. Matching is
# case/whitespace-insensitive; first match wins if multiple columns could map
# to the same canonical name. If headers are generic, value-based inference
# below tries to recover the material, unit, and price columns.
COLUMN_SYNONYMS: dict[str, set[str]] = {
    "raw_name": {
        "name", "item name", "product name", "item", "product",
        "material", "material name", "material description", "commodity",
        "particulars", "particular", "item particulars", "items",
        "product description", "item description", "description",
    },
    "description": {
        "description", "specification", "specifications", "spec desc",
        "description specification", "specification desc",
        "item specification", "material specification", "specifications description",
        "particulars", "particular", "item particulars",
    },
    "color": {
        "color", "colour", "material color", "material colour",
        "item color", "item colour", "product color", "product colour",
        "finish color", "finish colour",
    },
    "location": {
        "location", "locality", "area", "market location", "price location",
        "source location", "city", "municipality", "province", "district",
        "dpwh location", "cmpd location",
    },
    "raw_unit": {
        "unit", "uom", "unit of measure", "unit measure", "unit of measurement",
        "measure", "measurement", "packaging", "u/m", "u m", "um",
        "units", "u o m", "unit packaging", "unit/packaging",
    },
    "raw_price": {
        "price", "unit price", "unit cost", "cost", "amount", "rate",
        "unit rate", "market price", "selling price", "price php", "cost php",
        "unit price php", "unit cost php", "abc unit", "dupa rate",
        "material cost", "list price", "srp", "supplier price", "quoted price",
        "unit amount", "price per unit", "rate cost", "latest price",
    },
    "raw_brand": {
        "brand", "brand name", "manufacturer", "brand / manufacturer",
        "brand/manufacturer", "mfr", "make", "maker",
    },
}

UNIT_ALIASES = {
    "bg", "bag", "bags", "sack", "sacks",
    "pc", "pcs", "piece", "pieces", "pza", "ea", "each",
    "m3", "cum", "cu.m", "cu.m.", "cu m", "cubic meter", "cubic meters",
    "kg", "kgs", "kilo", "kilogram", "kilograms",
    "lng", "length", "ln.m", "l.m", "lm", "m", "meter", "meters",
    "sheet", "sheets", "sht", "roll", "rolls", "box", "boxes", "pail", "pails",
    "bundle", "bundles", "bd.ft", "bd ft", "board foot",
    "gal", "gallon", "liter", "litre", "ltr", "bdft",
}

NON_MATERIAL_PATTERNS = [
    re.compile(r"^\s*(item\s*no\.?|no\.?|qty|quantity|unit|uom|description|particulars|materials?)\s*$", re.I),
    re.compile(r"\b(grand\s+total|sub\s*total|subtotal|total\s+amount|summary|page\s+\d+)\b", re.I),
    re.compile(r"\b(section|division|category|chapter|approved budget|abc|bill of quantities)\b", re.I),
]

MATERIAL_HINT_PATTERN = re.compile(
    r"\b(cement|concrete|rebar|bar|steel|plywood|lumber|paint|pipe|pvc|gi|sheet|"
    r"sand|gravel|aggregate|bitumen|asphalt|tile|wire|cable|conduit|block|chb|"
    r"valve|fitting|nail|screw|bolt|sealant|primer|membrane)\b",
    re.I,
)

ITEM_CODE_PREFIX_PATTERN = re.compile(
    r"^\s*(?:[A-Z]{2,8}(?:-[A-Z0-9]{1,8}){1,4}|[A-Z]{1,5}\d{1,5}[A-Z]?)\s+",
    re.I,
)

COLOR_WORDS = {
    "black", "blue", "brown", "charcoal", "cream", "dark", "gray", "green",
    "grey", "ivory", "natural", "off-white", "orange", "red", "silver",
    "white", "wood", "yellow", "zinc",
}

UNRELATED_TEXT_HINT_PATTERN = re.compile(
    r"\b("
    r"proposal|abstract|introduction|methodology|recommendation|conclusion|"
    r"admin|student|database|deadlock|storage|archive|schema|table|varchar|"
    r"int\(|enum|tinyint|foreign key|primary key|chapter|appendix|"
    r"log-?in|authentication|credentials|use case|security|performance|instructor"
    r")\b",
    re.I,
)

KNOWN_BRAND_SUFFIXES = [
    "APO Building Products", "Republic Cement", "Pag-asa Steel", "Local Aggregate",
    "Phelps Dodge", "Santa Clara", "Standard Metal", "ABC System", "Puyat Steel",
    "HardieFlex", "SteelAsia", "Jackbilt", "Neltex", "Cemex", "Boysen", "Davies",
    "Mariwasa", "Eurotiles", "Knauf", "DN Steel", "InsuFoam", "Atlanta", "Emerald",
    "Powerhouse",
]

BRAND_ALIASES = {
    "Nettex": "Neltex",
}

KNOWN_MATERIAL_PREFIXES = [
    "Elastomeric Waterproofing Paint", "Rib-Type Pre-painted Roofing",
    "Glazed Ceramic Floor Tile", "Non-Slip Unglazed Tile", "Heavy Duty Tile Adhesive",
    "Fibre Cement Board", "Fiber Cement Board", "Metal Furring Channel",
    "Thermal Insulation Foam", "Concrete Hollow Blocks", "Concrete Hollow Block",
    "Deformed Steel Bar", "Ready-Mix Concrete", "Structural C-Purlins",
    "Corrugated G.I. Sheet", "PVC Sanitary Pipe", "THHN Copper Wire",
    "Portland Cement", "Washed Sand", "Crushed Gravel", "Marine Plywood",
    "Gypsum Board Standard", "Gypsum Board", "Latex Paint",
]


class MissingColumnsError(ValueError):
    def __init__(
        self,
        *,
        missing_columns: list[str],
        available_columns: list[str],
        detected_mapping: Mapping[str, str],
        preview_rows: list[dict[str, Any]],
    ) -> None:
        self.missing_columns = list(missing_columns)
        self.available_columns = list(available_columns)
        self.detected_mapping = dict(detected_mapping)
        self.preview_rows = list(preview_rows)
        missing_text = ", ".join(sorted(self.missing_columns)) if self.missing_columns else "none"
        super().__init__(f"Price list file is missing required column(s): {missing_text}")


def _header_key(value: Any) -> str:
    key = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    key = re.sub(r"\s*\([^)]*\)\s*$", "", key).strip()
    key = key.replace("_", " ").replace("-", " ").replace("/", " ")
    key = re.sub(r"[^a-z0-9. ]", "", key)
    return re.sub(r"\s+", " ", key).strip()


def _sanitize_text(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\u00a0", " ")).strip()


def _strip_item_code_prefix(value: Any) -> str:
    text = _sanitize_text(value)
    previous = None
    while text and text != previous:
        previous = text
        text = ITEM_CODE_PREFIX_PATTERN.sub("", text).strip(" -:|")
    return text


def _item_code_size_hint(value: Any) -> str | None:
    text = _sanitize_text(value)
    match = re.match(r"^\s*([A-Z]{2,8}(?:-[A-Z0-9]{1,8}){1,4})\b", text, re.I)
    if match is None:
        return None
    code = match.group(1).upper()
    suffix = code.rsplit("-", 1)[-1]
    if not suffix.isdigit():
        return None
    size = int(suffix)
    return f"{size}mm" if size > 0 else None


def _clean_trailing_ocr_unit_noise(value: Any) -> tuple[str, str | None]:
    text = _sanitize_text(value)
    if re.search(r"\b(?:pc|pe|pcs)\s*$", text, re.I):
        text = re.sub(r"\b(?:pc|pe|pcs)\s*$", "", text, flags=re.I).strip(" -:;,.|")
        return text, "pc"
    return text, None


def _clean_supplier_spec(value: Any, *, size_hint: str | None = None) -> str:
    text = _sanitize_text(value)
    text = re.sub(r"\b(?:pc|pe|pcs)\s*$", "", text, flags=re.I).strip(" -:;,.|")
    text = re.sub(r"^[^A-Za-z0-9]*(?:Fe\)?|F\)?|e\)?)\s*", "", text, flags=re.I).strip(" -:;,.|")
    text = re.sub(r"(\d+\s*mm)\s*[xX]\s*(\d)", r"\1 x \2", text, flags=re.I)
    text = re.sub(r"(\d)\s*[xX]\s*(\d)", r"\1 x \2", text)
    text = re.sub(r"\b(\d+)\s*mm(?=\W|$)", lambda match: f"{int(match.group(1))}mm", text, flags=re.I)
    if size_hint and re.search(r"\d+\s*mm", text, re.I):
        text = re.sub(r"\b\d+\s*mm(?=\W|$)", size_hint, text, count=1, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def _is_blank(value: Any) -> bool:
    return _sanitize_text(value) == ""


def _parse_price_value(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if float(value) > 0 else None

    text = _sanitize_text(value)
    if not text:
        return None
    has_currency_marker = bool(re.search(r"[₱$]|\b(?:php|peso|pesos)\b|(?<![A-Za-z])p\s*\d", text, re.I))
    text = re.sub(r"\b(?:php|peso|pesos)\b", "", text, flags=re.I)
    text = re.sub(r"(?<![A-Za-z])p\s*(?=\d)", "", text, flags=re.I)
    text = text.replace("₱", "").replace("$", "").replace(",", "")
    text = text.replace("(", "-").replace(")", "")
    has_unit_suffix = bool(re.match(r"^\s*-?\d+(?:\.\d+)?\s*(?:/|per)\s*[a-z]", text, re.I))
    if re.search(r"[a-z]", text, re.I) and not (has_currency_marker or has_unit_suffix):
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        parsed = float(match.group(0))
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _parse_price_value_with_ocr_cents(value: Any) -> float | None:
    parsed = _parse_price_value(value)
    if parsed is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        numeric = float(value)
        if numeric.is_integer() and numeric >= 10000 and numeric % 100 == 0:
            return numeric / 100
    text = _sanitize_text(value)
    if (
        isinstance(value, str)
        and parsed >= 10000
        and re.fullmatch(r"(?:[₱$]|p\s*)?\d{4,6}", text.replace(",", ""), re.I)
    ):
        return parsed / 100
    return parsed


def _is_probably_sequence(values: list[float]) -> bool:
    if len(values) < 3:
        return False
    ints = [int(value) for value in values if float(value).is_integer()]
    if len(ints) < len(values) * 0.8:
        return False
    expected = list(range(ints[0], ints[0] + len(ints)))
    return ints == expected


def _is_unit_value(value: Any) -> bool:
    text = _header_key(value)
    if text in UNIT_ALIASES:
        return True
    return bool(re.fullmatch(r"\d+\s?(?:kg|mm|m|in|inch|inches)", text))


def _extract_unit_from_text(value: Any) -> str:
    text = _sanitize_text(value)
    lowered = text.lower()
    for alias in sorted(UNIT_ALIASES, key=len, reverse=True):
        escaped = re.escape(alias).replace(r"\ ", r"\s+")
        if re.search(rf"\b{escaped}\b", lowered):
            return alias
    package_match = re.search(r"\b\d+\s?(kg|mm|m|in|inch|inches)\b", lowered)
    return package_match.group(1) if package_match else ""


def _unit_pattern() -> str:
    aliases = sorted(UNIT_ALIASES, key=len, reverse=True)
    return "|".join(re.escape(alias).replace(r"\ ", r"\s+") for alias in aliases)


def _singular_unit_key(value: str) -> str:
    key = _header_key(value)
    return key[:-1] if key.endswith("s") else key


def _select_pdf_uom_match(matches: list[re.Match[str]], before_price: str) -> re.Match[str]:
    if len(matches) >= 2:
        last = matches[-1]
        previous = matches[-2]
        between = before_price[previous.end() : last.start()]
        if re.fullmatch(r"\s*\d[\d,]*(?:\.\d+)?\s*", between):
            previous_key = _singular_unit_key(previous.group(0))
            last_key = _singular_unit_key(last.group(0))
            if previous_key == last_key or last_key in {"pc", "piece", "bag", "sheet", "box", "roll", "length", "cu.m", "cum"}:
                return previous
    return matches[-1]


def _split_flat_pdf_content(content: str) -> dict[str, str]:
    text = _sanitize_text(content)
    brand = "Generic"
    for candidate in sorted(KNOWN_BRAND_SUFFIXES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(candidate)}$", text, re.I):
            brand = candidate
            text = re.sub(rf"\b{re.escape(candidate)}$", "", text, flags=re.I).strip()
            break

    for candidate in sorted(KNOWN_MATERIAL_PREFIXES, key=len, reverse=True):
        if re.match(rf"^{re.escape(candidate)}\b", text, re.I):
            return {
                "raw_name": text[: len(candidate)].strip(),
                "description": text[len(candidate) :].strip(),
                "raw_brand": brand,
            }

    marker = re.search(
        r"\b(?:Type|Grade|Non-Load|Load-Bearing|Screened|Gauge|Series|PN20|Self-priming|"
        r"Commercial|Premium|Standard|\d+(?:\.\d+)?\s*(?:kg|mm|cm|m|ft|\"|PSI|%))\b",
        text,
        re.I,
    )
    if marker and marker.start() > 3:
        return {
            "raw_name": text[: marker.start()].strip(),
            "description": text[marker.start() :].strip(),
            "raw_brand": brand,
        }

    return {"raw_name": text, "description": "", "raw_brand": brand}


def _split_inline_brand_and_spec(raw_name: str, current_brand: Any = None, current_description: Any = None) -> dict[str, str]:
    size_hint = _item_code_size_hint(raw_name)
    text = _strip_item_code_prefix(raw_name)
    brand = _sanitize_text(current_brand) or "Generic"
    description = _clean_supplier_spec(current_description, size_hint=size_hint)

    if description and brand != "Generic":
        return {"raw_name": text, "description": description, "raw_brand": brand}

    for candidate in sorted(KNOWN_BRAND_SUFFIXES, key=len, reverse=True):
        match = re.search(rf"\b{re.escape(candidate)}\b", text, re.I)
        if match is None:
            continue

        before = text[: match.start()].strip(" -:;,.|")
        after = text[match.end() :].strip(" -:;,.|")
        if len(before) < 3:
            continue
        if after and not (
            re.search(r"\d", after)
            or re.search(r"\b(?:mm|cm|m|in|inch|inches|kg|x|pn|s-|series|schedule|sched)\b", after, re.I)
        ):
            continue

        canonical_brand = BRAND_ALIASES.get(candidate, candidate)
        before, trailing_unit = _clean_trailing_ocr_unit_noise(before)
        after, after_trailing_unit = _clean_trailing_ocr_unit_noise(after)
        clean_after = _clean_supplier_spec(after, size_hint=size_hint)
        return {
            "raw_name": before,
            "description": description or clean_after,
            "raw_brand": canonical_brand,
            "raw_unit": trailing_unit or after_trailing_unit or "",
        }

    text, trailing_unit = _clean_trailing_ocr_unit_noise(text)
    return {
        "raw_name": text,
        "description": _clean_supplier_spec(description, size_hint=size_hint),
        "raw_brand": BRAND_ALIASES.get(brand, brand),
        "raw_unit": trailing_unit or "",
    }


def _is_non_material_row(raw_name: Any, raw_price: Any, *, require_price: bool = True) -> bool:
    name = _sanitize_text(raw_name)
    if not name:
        return True
    if require_price and _parse_price_value(raw_price) is None:
        return True
    if any(pattern.search(name) for pattern in NON_MATERIAL_PATTERNS):
        return True
    if len(name) <= 2 and not MATERIAL_HINT_PATTERN.search(name):
        return True
    return False


def _column_priority_for_canonical(column: Any, canonical: str) -> float:
    key = _header_key(column)
    if canonical == "raw_name":
        if any(token in key for token in ["item", "product", "name"]):
            return 8.0
        if any(token in key for token in ["material", "commodity"]):
            return 4.0
        return 1.0
    if canonical == "description":
        if any(token in key for token in ["spec", "description", "particular", "detail"]):
            return 8.0
        return 0.0
    if canonical == "raw_unit":
        return 4.0 if key in {"unit", "uom", "measure", "measurement", "packaging"} else 0.0
    if canonical == "raw_price":
        return 4.0 if key in {"price", "cost", "amount", "rate"} else 0.0
    return 0.0


def _is_generic_column_name(value: Any) -> bool:
    key = _header_key(value)
    if not key:
        return True
    if key in REQUIRED_COLUMNS or key in {"description", "raw_brand", "color", "location"}:
        return False
    return bool(re.fullmatch(r"(?:column|col|field|header)\s*\d+", key)) or bool(re.fullmatch(r"[a-z]", key))


def _has_header_signal(columns: list[Any]) -> bool:
    for column in columns:
        key = _header_key(column)
        if key in REQUIRED_COLUMNS or key in {"description", "raw_brand", "color"}:
            continue
        if not _is_generic_column_name(column) or _header_matches(column) is not None:
            return True
    return False


def _is_metadata_column_name_for_price_preservation(column: Any) -> bool:
    key = _header_key(column)
    if key in {_header_key(value) for value in REQUIRED_COLUMNS | {"description", "raw_brand", "color", "location"}}:
        return True
    return any(
        token in key
        for token in (
            "item no", "item number", "item code", "material id", "code",
            "unit", "uom", "measure", "description", "material", "brand",
            "color", "quarter", "period", "year", "region", "location",
        )
    )


def _column_has_parseable_prices(series: pd.Series) -> bool:
    parsed_values = [_parse_price_value(value) for value in series]
    prices = [value for value in parsed_values if value is not None]
    if not prices or _is_probably_sequence(prices):
        return False
    non_blank_values = [value for value in series if not _is_blank(value)]
    return len(prices) >= max(1, len(non_blank_values) // 2)


def _normalize_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    df = _promote_embedded_header(df)

    explicit_header_signal = any(_header_matches(column) is not None for column in df.columns)
    generic_only_headers = all(_is_generic_column_name(column) for column in df.columns)
    if not explicit_header_signal and generic_only_headers and len(df.columns) <= 3:
        return df, {}

    rename_map: dict[Any, str] = {}
    assigned_columns: set[Any] = set()

    # Check for brand/manufacturer column first
    for col in df.columns:
        header_key = _header_key(col)
        if "raw_brand" not in df.columns and "raw_brand" not in rename_map.values():
            if any(token in header_key for token in ["brand", "manufacturer", "mfr", "maker"]):
                rename_map[col] = "raw_brand"
                assigned_columns.add(col)
                break

    for col in df.columns:
        header_key = _header_key(col)
        if "color" not in df.columns and "color" not in rename_map.values():
            if any(token in header_key for token in ["color", "colour"]):
                rename_map[col] = "color"
                assigned_columns.add(col)
                break

    for col in df.columns:
        header_key = _header_key(col)
        if "location" not in df.columns and "location" not in rename_map.values():
            if (
                any(token in header_key for token in ["location", "locality", "area", "city", "municipality", "province", "district"])
                and not _column_has_parseable_prices(df[col])
            ):
                rename_map[col] = "location"
                assigned_columns.add(col)
                break

    if "description" not in df.columns and "description" not in rename_map.values():
        description_candidates: list[tuple[float, Any]] = []
        for col in df.columns:
            header_key = _header_key(col)
            if header_key in REQUIRED_COLUMNS:
                continue
            if any(token in header_key for token in ["spec", "description", "detail"]):
                score = 0.0
                if "spec" in header_key:
                    score += 8.0
                if "size" in header_key:
                    score += 3.0
                if "detail" in header_key:
                    score += 2.0
                if "description" in header_key:
                    score += 1.0
                description_candidates.append((score, col))
        if description_candidates:
            _, best_col = max(description_candidates, key=lambda item: item[0])
            rename_map[best_col] = "description"
            assigned_columns.add(best_col)

    if "raw_name" not in df.columns and "raw_name" not in rename_map.values():
        if any(_header_matches(col) == "raw_name" for col in df.columns):
            for col in df.columns:
                if col in assigned_columns:
                    continue
                if _header_matches(col) == "raw_name":
                    rename_map[col] = "raw_name"
                    assigned_columns.add(col)
                    break
        else:
            candidates: list[tuple[float, Any]] = []
            for col in df.columns:
                header_key = _header_key(col)
                if header_key in REQUIRED_COLUMNS:
                    continue
                if re.search(r"\b(?:item\s+)?(?:no|number|code|id)\b", header_key):
                    continue
                if any(token in header_key for token in ["material", "product", "name", "particular"]):
                    score = 0.0
                    if "material" in header_key:
                        score += 4.0
                    if "particular" in header_key:
                        score += 3.5
                    if "product" in header_key or "name" in header_key:
                        score += 2.5
                    if "item" in header_key:
                        score += 1.5
                    if score > 0:
                        candidates.append((score, col))

            if candidates:
                _, best_col = max(candidates, key=lambda item: item[0])
                rename_map[best_col] = "raw_name"
                assigned_columns.add(best_col)

    for canonical in ("raw_price", "raw_unit"):
        candidates: list[tuple[float, Any]] = []
        for col in df.columns:
            if col in assigned_columns or col in REQUIRED_COLUMNS:
                continue
            header_key = _header_key(col)
            if header_key in REQUIRED_COLUMNS:
                continue
            if _header_matches(col) != canonical:
                continue
            score = _column_priority_for_canonical(col, canonical)
            if canonical == "raw_price" and score <= 0:
                score = 4.0
            if score > 0:
                candidates.append((score, col))

        if not candidates:
            continue

        best_score, best_col = max(candidates, key=lambda item: item[0])
        if best_score <= 0:
            continue
        rename_map[best_col] = canonical
        assigned_columns.add(best_col)

    raw_price_source_col = next((original for original, canonical in rename_map.items() if canonical == "raw_price"), None)
    price_like_columns = [
        col
        for col in df.columns
        if col != raw_price_source_col
        and not _is_metadata_column_name_for_price_preservation(col)
        and _column_has_parseable_prices(df[col])
    ]
    renamed = df.rename(columns=rename_map)
    if raw_price_source_col is None and len(price_like_columns) > 1 and "raw_price" not in renamed.columns:
        renamed["raw_price"] = df[price_like_columns[0]].values
    if raw_price_source_col is not None and price_like_columns:
        original_label = _sanitize_text(raw_price_source_col)
        if original_label and original_label not in renamed.columns:
            renamed[original_label] = df[raw_price_source_col].values
    renamed = _infer_missing_columns(renamed)
    detected_mapping = {canonical: str(original) for original, canonical in rename_map.items() if canonical in REQUIRED_COLUMNS}
    return renamed, detected_mapping


def _header_matches(value: Any) -> str | None:
    key = _header_key(value)
    normalized_requirements = {_header_key(canonical) for canonical in REQUIRED_COLUMNS}
    if key in normalized_requirements:
        return next(canonical for canonical in REQUIRED_COLUMNS if _header_key(canonical) == key)
    if key in {_header_key("description"), _header_key("raw_brand"), _header_key("color"), _header_key("location")}:
        if key == _header_key("description"):
            return "description"
        if key == _header_key("raw_brand"):
            return "raw_brand"
        if key == _header_key("location"):
            return "location"
        return "color"
    if any(token in key for token in ["full item description", "item description", "product description"]):
        return "raw_name"
    if any(token in key for token in ["packing", "pack", "uom", "unit of measure", "unit measure"]):
        return "raw_unit"
    if any(token in key for token in ["approx total cost", "total cost", "cost", "amount", "rate"]):
        return "raw_price"
    for canonical, synonyms in COLUMN_SYNONYMS.items():
        if key in {_header_key(synonym) for synonym in synonyms}:
            return canonical
    if any(token in key for token in ["spec", "description", "detail"]):
        return "description"
    if any(token in key for token in ["color", "colour"]):
        return "color"
    if any(token in key for token in ["location", "locality", "area", "city", "municipality", "province", "district"]):
        return "location"
    # Check for brand/manufacturer column with special handling
    if any(token in key for token in ["brand", "manufacturer", "mfr", "maker"]):
        return "raw_brand"
    return None


def _row_header_score(row: pd.Series) -> int:
    score = 0
    seen: set[str] = set()
    for value in row:
        canonical = _header_matches(value)
        if canonical and canonical not in seen:
            score += 2
            seen.add(canonical)
    return score


def _promote_embedded_header(df: pd.DataFrame) -> pd.DataFrame:
    if REQUIRED_COLUMNS & set(df.columns):
        return df

    best_index: int | None = None
    best_score = 0
    for index, row in df.head(12).iterrows():
        score = _row_header_score(row)
        if score > best_score:
            best_index = index
            best_score = score

    if best_index is None or best_score < 4:
        if any(_header_key(value) in REQUIRED_COLUMNS for value in df.iloc[0].tolist()):
            promoted = df.iloc[1:].copy()
            promoted.columns = [
                _sanitize_text(value) or f"column_{position + 1}"
                for position, value in enumerate(df.iloc[0].tolist())
            ]
            return promoted.reset_index(drop=True)
        return df

    promoted = df.iloc[best_index + 1 :].copy()
    promoted.columns = [
        _sanitize_text(value) or f"column_{position + 1}"
        for position, value in enumerate(df.iloc[best_index].tolist())
    ]
    promoted = promoted.dropna(how="all")
    return promoted.reset_index(drop=True)


def _column_score_for_price(series: pd.Series) -> float:
    parsed_values = [_parse_price_value(value) for value in series]
    values = [value for value in parsed_values if value is not None]
    if not values:
        return 0

    score = float(len(values) * 3)
    if _is_probably_sequence(values):
        score -= len(values) * 4
    for raw_value in series:
        text = _sanitize_text(raw_value)
        if re.search(r"[₱$]|php|\d,\d{3}|\d+\.\d{2}\b", text, re.I):
            score += 1
    if sum(value >= 20 for value in values) >= max(1, len(values) // 2):
        score += 2
    return max(score, 0)


def _column_score_for_unit(series: pd.Series) -> float:
    values = [value for value in series if not _is_blank(value)]
    if not values:
        return 0
    unit_count = sum(_is_unit_value(value) for value in values)
    return float(unit_count * 3 - (len(values) - unit_count))


def _column_score_for_name(series: pd.Series) -> float:
    score = 0.0
    for value in series:
        text = _sanitize_text(value)
        if len(text) < 3 or _parse_price_value(text) is not None or _is_unit_value(text):
            continue

        lower_text = text.lower()
        if any(token in lower_text for token in ["spec", "description", "particular", "article", "product"]):
            score += 6
        if MATERIAL_HINT_PATTERN.search(text):
            score += 4
        else:
            score += 1
        if len(text) > 12:
            score += 1
    return score


def _best_column(df: pd.DataFrame, scorer, excluded: set[Any]) -> Any | None:
    candidates = [(scorer(df[col]), position, col) for position, col in enumerate(df.columns) if col not in excluded]
    candidates = [candidate for candidate in candidates if candidate[0] > 0]
    if not candidates:
        return None
    candidates.sort(key=lambda candidate: (candidate[0], candidate[1]), reverse=True)
    return candidates[0][2]


def _infer_missing_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map: dict[Any, str] = {}
    existing = REQUIRED_COLUMNS & set(df.columns)
    assigned: set[Any] = set()

    has_header_signal = any(_header_matches(column) is not None for column in df.columns)
    if not has_header_signal and len(df.columns) <= 3:
        if "raw_brand" not in df.columns:
            df["raw_brand"] = "Generic"
        return df

    if "raw_price" not in existing:
        price_col = _best_column(df, _column_score_for_price, existing | assigned)
        if price_col:
            rename_map[price_col] = "raw_price"
            existing.add("raw_price")
            assigned.add(price_col)

    if "raw_unit" not in existing:
        unit_col = _best_column(df, _column_score_for_unit, existing | assigned)
        if unit_col:
            rename_map[unit_col] = "raw_unit"
            existing.add("raw_unit")
            assigned.add(unit_col)

    if "raw_name" not in existing:
        name_col = _best_column(df, _column_score_for_name, existing | assigned)
        if name_col:
            rename_map[name_col] = "raw_name"

    if rename_map:
        df = df.rename(columns=rename_map)
    
    # Ensure raw_brand column exists; fill with "Generic" if missing
    if "raw_brand" not in df.columns:
        df["raw_brand"] = "Generic"
    
    return df


def _has_pricelist_relevance(df: pd.DataFrame) -> bool:
    if df.empty or not {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns):
        return False

    rows = []
    for _, row in df.iterrows():
        name = _sanitize_text(row.get("raw_name"))
        if not name:
            continue
        unit = _sanitize_text(row.get("raw_unit"))
        price = row.get("raw_price")
        has_price = _parse_price_value(price) is not None
        has_unit = bool(unit) and (unit != "unit" or _extract_unit_from_text(name))
        has_material_hint = bool(MATERIAL_HINT_PATTERN.search(name))
        has_unrelated_hint = bool(UNRELATED_TEXT_HINT_PATTERN.search(name))
        has_pricelist_shape = has_price and has_unit and not has_unrelated_hint
        rows.append((has_price, has_unit, has_material_hint or has_pricelist_shape, has_unrelated_hint))

    if not rows:
        return False

    material_like = sum(1 for has_price, has_unit, has_material_hint, has_unrelated_hint in rows if not has_unrelated_hint and has_material_hint and (has_price or has_unit))
    unrelated = sum(1 for _, _, _, has_unrelated_hint in rows if has_unrelated_hint)

    if material_like == 0:
        return False
    if material_like < max(1, len(rows) // 3):
        return False
    if unrelated > material_like:
        return False
    return True


def _has_unrelated_document_signals(df: pd.DataFrame) -> bool:
    texts = [
        _sanitize_text(value)
        for value in df.to_numpy().flatten().tolist()
        if _sanitize_text(value)
    ]
    if not texts:
        return False
    unrelated = sum(1 for text in texts if UNRELATED_TEXT_HINT_PATTERN.search(text))
    material = sum(1 for text in texts if MATERIAL_HINT_PATTERN.search(text))
    return unrelated > 0 and material == 0


def _dedupe_and_label_columns(df: pd.DataFrame) -> pd.DataFrame:
    deduped = df.copy()
    used: set[str] = set()
    new_columns: list[str] = []
    for position, column in enumerate(deduped.columns):
        label = _sanitize_text(column)
        if not label or label in used:
            label = f"Column {position + 1}"
        while label in used and label != f"Column {position + 1}":
            label = f"{label}_2"
        if label in used:
            label = f"Column {position + 1}"
        used.add(label)
        new_columns.append(label)
    deduped.columns = new_columns
    return deduped


def _clean_pdf_row(row: list[Any]) -> list[str]:
    return [_sanitize_text(cell) for cell in row]


def _pad_pdf_rows(rows: list[list[str]], width: int) -> list[list[str]]:
    return [row + [""] * (width - len(row)) for row in rows]


def _pdf_table_to_dataframe(table: list[list[Any]]) -> pd.DataFrame | None:
    cleaned_rows = [_clean_pdf_row(row) for row in table if row and any(not _is_blank(cell) for cell in row)]
    if not cleaned_rows:
        return None

    width = max(len(row) for row in cleaned_rows)
    padded_rows = _pad_pdf_rows(cleaned_rows, width)

    header_index: int | None = None
    header_score = 0
    for index, row in enumerate(padded_rows[:12]):
        non_blank_count = sum(not _is_blank(cell) for cell in row)
        score = _row_header_score(pd.Series(row))
        if non_blank_count >= 2 and score > header_score:
            header_index = index
            header_score = score

    if header_index is not None and header_score >= 4:
        header = [
            _sanitize_text(value) or f"column_{position + 1}"
            for position, value in enumerate(padded_rows[header_index])
        ]
        body = [
            row
            for row in padded_rows[header_index + 1 :]
            if [_header_key(cell) for cell in row] != [_header_key(cell) for cell in header]
        ]
    else:
        header = [f"column_{position + 1}" for position in range(width)]
        body = padded_rows

    if not body:
        return None
    return pd.DataFrame(body, columns=header)


def _parse_pdf(path: Path) -> pd.DataFrame:
    # Relies on pdfplumber detecting an actual ruled/gridded table in the PDF
    # (as DPWH/PSA/supplier price-list PDFs typically have) — this is not OCR
    # and won't extract a table from a plain text layout or a scanned image.
    frames: list[pd.DataFrame] = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                frame = _pdf_table_to_dataframe(table)
                if frame is not None:
                    frames.append(frame)

    if not frames:
        text_fallback = _parse_pdf_text_or_none(path)
        if text_fallback is not None:
            return text_fallback
        dpwh_ocr_fallback = _parse_dpwh_cmpd_ocr_table(path)
        if dpwh_ocr_fallback is not None:
            return dpwh_ocr_fallback
        simple_ocr_fallback = _parse_simple_pricelist_ocr_table(path)
        if simple_ocr_fallback is not None:
            return simple_ocr_fallback
        ocr_fallback = _parse_pdf_ocr_table(path)
        if ocr_fallback is not None:
            return ocr_fallback
        raise ValueError(
            "No table found in PDF price list. This PDF appears to be scanned; install/configure OCR dependencies "
            "(Poppler and Tesseract) so image-only price list pages can be read."
        )

    df = pd.concat(frames, ignore_index=True, sort=False)
    df = df.map(lambda cell: cell.strip() if isinstance(cell, str) else cell)
    return df


DPWH_NIR_DEO_COLUMNS = [
    "NEGROS OCCIDENTAL 1ST DEO",
    "NEGROS OCCIDENTAL 2ND DEO",
    "NEGROS OCCIDENTAL 3RD DEO",
    "NEGROS OCCIDENTAL 4TH DEO",
    "NEGROS OCCIDENTAL 5TH DEO",
    "NEGROS ORIENTAL 1ST DEO",
    "NEGROS ORIENTAL 2ND DEO",
    "NEGROS ORIENTAL 3RD DEO",
    "BACOLOD DEO",
    "SIQUIJOR DEO",
]


def _clean_ocr_price(value: str) -> float | None:
    text = _sanitize_text(value)
    if not text:
        return None
    had_decimal = "." in text
    text = text.replace("|", "").replace("[", "").replace("]", "")
    text = text.replace("{", "").replace("}", "").replace(")", "").replace("(", "")
    text = text.replace("S", "5").replace("O", "0").replace("o", "0")
    parsed = _parse_price_value(text)
    if parsed is not None and not had_decimal and parsed >= 10000:
        return parsed / 100
    return parsed


def _clean_dpwh_ocr_text(value: str) -> str:
    text = _sanitize_text(value)
    text = re.sub(r"\bI?M[Gg][0O][A-Za-z0-9]{1,2}[.,]\d{3,4}\b", "", text)
    text = re.sub(r"[_`'‘’]+", " ", text)
    text = re.sub(r"[^A-Za-z0-9À-ÿ\s.,/&()\"'°@+\-]", " ", text)
    text = re.sub(r"^[|_\-:\s]+|[|_\-:\s]+$", "", text)
    text = re.sub(r"^[JTI]\s*(?=[A-Z(])", "", text)
    text = re.sub(r"\s*[=|]+\s*$", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" |[]{}")


def _normalize_dpwh_material_code(value: str) -> str | None:
    match = re.search(r"\bI?M[Gg]([0O][A-Za-z0-9]{1,2})[.,](\d{3,4})\b", value)
    if match is None:
        return None
    section_digits = re.sub(r"\D", "", match.group(1).upper().replace("O", "0").replace("S", "5"))
    item_digits = re.sub(r"\D", "", match.group(2))
    if not section_digits or not item_digits:
        return None
    section = str(int(section_digits)).zfill(2)
    return f"MG{section}.{item_digits.zfill(4)}"


def _clean_dpwh_unit(value: str, raw_name: str) -> str:
    text = re.sub(r"[^A-Za-z0-9./-]", "", _sanitize_text(value)).upper()
    replacements = {
        "KET": "KG",
        "KE": "KG",
        "GAT": "GAL",
        "6AL": "GAL",
        "UR": "LTR",
        "UE": "LTR",
        "ET": "LTR",
        "PT": "PC",
        "PE": "PC",
        "NA": "PC",
        "CON": "KG",
    }
    text = replacements.get(text, text)
    if text not in {"KG", "GAL", "LTR", "BDFT", "PC", "M", "CUM", "NONE"}:
        extracted = _extract_unit_from_text(raw_name).upper()
        text = extracted or text
    return text[:30] or "unit"


def _ocr_single_line(image: Any, box: tuple[int, int, int, int], whitelist: str | None = None) -> str:
    try:
        from PIL import ImageOps
        import pytesseract
    except ImportError:
        return ""

    _configure_tesseract(pytesseract)
    crop = ImageOps.expand(image.crop(box), border=8, fill=255)
    config = "--psm 7"
    if whitelist:
        config += f" -c tessedit_char_whitelist={whitelist}"
    try:
        return _sanitize_text(pytesseract.image_to_string(crop, config=config))
    except Exception:
        return ""


def _dpwh_horizontal_grid_lines(image: Any) -> list[int]:
    try:
        import numpy as np
    except ImportError:
        return []

    grayscale = image.convert("L")
    pixels = np.array(grayscale)
    dark_pixels = pixels < 120
    row_density = dark_pixels.mean(axis=1)
    candidate_rows = np.where(row_density > 0.25)[0]
    if len(candidate_rows) == 0:
        return []

    runs: list[tuple[int, int]] = []
    start = previous = int(candidate_rows[0])
    for row in candidate_rows[1:]:
        current = int(row)
        if current - previous > 2:
            runs.append((start, previous))
            start = current
        previous = current
    runs.append((start, previous))
    return [(start + end) // 2 for start, end in runs]


def _dpwh_bucket_index(center_x: float, image_width: int) -> int | None:
    # Ratios measured from the scanned DPWH CMPD landscape pages. They target
    # the centers of the ten DEO price columns after Material Code/Description/Unit.
    centers = [0.521, 0.568, 0.616, 0.663, 0.710, 0.758, 0.805, 0.853, 0.902, 0.949]
    tolerance = 0.030
    ratio = center_x / image_width
    nearest_index = min(range(len(centers)), key=lambda index: abs(ratio - centers[index]))
    return nearest_index if abs(ratio - centers[nearest_index]) <= tolerance else None


def _parse_dpwh_cmpd_ocr_table(path: Path) -> pd.DataFrame | None:
    try:
        from pdf2image import convert_from_path
    except ImportError:
        return None

    try:
        images = _convert_pdf_to_images(convert_from_path, path, dpi=220)
    except Exception:
        return None

    rows: list[dict[str, Any]] = []
    for image in images:
        image = image.convert("L")
        width, _ = image.size
        grid_lines = _dpwh_horizontal_grid_lines(image)
        if len(grid_lines) < 4:
            continue

        price_centers = [0.521, 0.568, 0.616, 0.663, 0.710, 0.758, 0.805, 0.853, 0.902, 0.949]
        price_edges = [0.500] + [
            (price_centers[index] + price_centers[index + 1]) / 2 for index in range(len(price_centers) - 1)
        ] + [0.975]

        for index in range(len(grid_lines) - 1):
            top = grid_lines[index] + 1
            bottom = grid_lines[index + 1] - 1
            if bottom - top < 8:
                continue

            code_text = _ocr_single_line(
                image,
                (int(width * 0.020), top, int(width * 0.095), bottom),
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,",
            )
            normalized_code = _normalize_dpwh_material_code(code_text)
            if normalized_code is None:
                continue
            if normalized_code.endswith(".0000"):
                continue

            raw_name = _clean_dpwh_ocr_text(
                _ocr_single_line(image, (int(width * 0.090), top, int(width * 0.450), bottom))
            )
            if not raw_name or _parse_price_value(raw_name) is not None:
                continue

            raw_unit = _clean_dpwh_unit(
                _ocr_single_line(
                    image,
                    (int(width * 0.450), top, int(width * 0.500), bottom),
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz./",
                ),
                raw_name,
            )

            row: dict[str, Any] = {
                "raw_name": raw_name,
                "raw_unit": raw_unit,
                "raw_brand": "Generic",
                "material_code": normalized_code,
            }
            found_price = False
            for bucket_index, column in enumerate(DPWH_NIR_DEO_COLUMNS):
                price_text = _ocr_single_line(
                    image,
                    (
                        int(width * price_edges[bucket_index]),
                        top,
                        int(width * price_edges[bucket_index + 1]),
                        bottom,
                    ),
                    "0123456789,.",
                )
                price = _clean_ocr_price(price_text)
                if price is None:
                    continue
                row[column] = price
                found_price = True
            if found_price:
                rows.append(row)

    if not rows:
        return None
    return pd.DataFrame(rows).drop_duplicates(
        subset=["material_code", "raw_name", "raw_unit", *DPWH_NIR_DEO_COLUMNS],
        keep="first",
    )


def _cluster_ocr_words_into_rows(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    rows: list[list[dict[str, Any]]] = []
    for word in sorted(words, key=lambda item: (item["top"], item["left"])):
        placed = False
        word_mid = word["top"] + word["height"] / 2
        for row in rows:
            row_mid = sum(item["top"] + item["height"] / 2 for item in row) / len(row)
            if abs(word_mid - row_mid) <= max(10, word["height"] * 0.8):
                row.append(word)
                placed = True
                break
        if not placed:
            rows.append([word])
    return [sorted(row, key=lambda item: item["left"]) for row in rows]


def _ocr_row_to_cells(row: list[dict[str, Any]]) -> list[str]:
    if not row:
        return []
    gaps = [
        row[index + 1]["left"] - (row[index]["left"] + row[index]["width"])
        for index in range(len(row) - 1)
    ]
    large_gap = max(18, (sum(gaps) / len(gaps) * 0.8) if gaps else 18)

    cells: list[list[str]] = [[row[0]["text"]]]
    for index, word in enumerate(row[1:], start=1):
        previous = row[index - 1]
        gap = word["left"] - (previous["left"] + previous["width"])
        if gap >= large_gap:
            cells.append([word["text"]])
        else:
            cells[-1].append(word["text"])
    return [_sanitize_text(" ".join(cell)) for cell in cells if _sanitize_text(" ".join(cell))]


def _parse_pdf_ocr_table(path: Path) -> pd.DataFrame | None:
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return None

    _configure_tesseract(pytesseract)
    try:
        images = _convert_pdf_to_images(convert_from_path, path, dpi=300)
    except Exception:
        return None

    table_rows: list[list[str]] = []
    for image in images:
        try:
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 6")
        except Exception:
            continue

        words: list[dict[str, Any]] = []
        for index, text in enumerate(data.get("text", [])):
            clean = _sanitize_text(text)
            if not clean:
                continue
            try:
                confidence = float(data.get("conf", ["-1"])[index])
            except (TypeError, ValueError):
                confidence = -1
            if confidence < 25:
                continue
            words.append(
                {
                    "text": clean,
                    "left": int(data["left"][index]),
                    "top": int(data["top"][index]),
                    "width": int(data["width"][index]),
                    "height": int(data["height"][index]),
                }
            )

        for row in _cluster_ocr_words_into_rows(words):
            cells = _ocr_row_to_cells(row)
            if len(cells) >= 3:
                table_rows.append(cells)

    if not table_rows:
        return None

    width = max(len(row) for row in table_rows)
    return pd.DataFrame(_pad_pdf_rows(table_rows, width), columns=[f"column_{index + 1}" for index in range(width)])


def _ocr_row_to_line(row: list[dict[str, Any]]) -> str:
    return _sanitize_text(" ".join(word["text"] for word in sorted(row, key=lambda item: item["left"])))


def _parse_simple_pricelist_ocr_line(line: str) -> dict[str, str] | None:
    clean = re.sub(r"\s+", " ", line).strip()
    if not clean or _is_pdf_noise_line(clean):
        return None

    price_matches = list(re.finditer(r"(?<![A-Za-z'\"])(?:[₱$]|p\s*)?\d[\d,]*(?:\.\d{1,2})?(?![A-Za-z'\"])", clean, re.I))
    price_match = price_matches[-1] if price_matches else None
    before_price = clean[: price_match.start()].strip() if price_match else clean
    after_price = clean[price_match.end() :].strip() if price_match else ""
    price = price_match.group(0) if price_match else ""

    unit_matches = list(re.finditer(rf"\b(?:{_unit_pattern()})\b", before_price, re.I))
    if unit_matches:
        unit_match = unit_matches[-1]
        raw_name = before_price[: unit_match.start()].strip(" -:|")
        raw_unit = unit_match.group(0)
    else:
        raw_name = before_price.strip(" -:|")
        after_price_unit = re.search(rf"\b(?:{_unit_pattern()})\b", after_price, re.I)
        raw_unit = after_price_unit.group(0) if after_price_unit else _extract_unit_from_text(raw_name)

    raw_name = re.sub(r"^\s*(?:\d+[\.)-]?\s*)", "", raw_name).strip()
    raw_name = _strip_item_code_prefix(raw_name)
    raw_name = re.sub(r"\b(?:item|price|uom|unit)\b", "", raw_name, flags=re.I).strip(" -:|")
    if not raw_name or len(raw_name) < 3:
        return None
    if not raw_unit and not price:
        return None
    if not MATERIAL_HINT_PATTERN.search(raw_name) and not (raw_unit and price):
        return None
    if UNRELATED_TEXT_HINT_PATTERN.search(raw_name):
        return None

    return {
        "raw_name": raw_name,
        "raw_unit": raw_unit or "unit",
        "raw_price": price,
        "raw_brand": "Generic",
        "description": "",
    }


def _prepare_ocr_image_variants(image: Any) -> list[Any]:
    variants = [image]
    try:
        from PIL import ImageEnhance, ImageFilter, ImageOps
    except ImportError:
        return variants

    try:
        grayscale = image.convert("L")
        variants.append(grayscale)
        variants.append(ImageOps.autocontrast(grayscale).resize((grayscale.width * 2, grayscale.height * 2)))
        enhanced = ImageEnhance.Contrast(grayscale).enhance(2.5)
        enhanced = ImageEnhance.Sharpness(enhanced).enhance(2.0)
        variants.append(enhanced.resize((enhanced.width * 2, enhanced.height * 2)))
        variants.append(enhanced.filter(ImageFilter.MedianFilter(size=3)).point(lambda pixel: 0 if pixel < 170 else 255))
    except Exception:
        return variants
    return variants


def _parse_simple_pricelist_ocr_text(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in text.splitlines():
        parsed = _parse_simple_pricelist_ocr_line(line)
        if parsed is not None:
            rows.append(parsed)
    return rows


def _parse_simple_pricelist_ocr_table(path: Path) -> pd.DataFrame | None:
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return None

    _configure_tesseract(pytesseract)
    try:
        images = _convert_pdf_to_images(convert_from_path, path, dpi=300)
    except Exception:
        return None

    parsed_rows: list[dict[str, str]] = []
    for image in images:
        for variant in _prepare_ocr_image_variants(image):
            try:
                text = pytesseract.image_to_string(variant, config="--psm 6")
            except Exception:
                text = ""
            parsed_rows.extend(_parse_simple_pricelist_ocr_text(text))

            try:
                data = pytesseract.image_to_data(variant, output_type=pytesseract.Output.DICT, config="--psm 6")
            except Exception:
                continue

            words: list[dict[str, Any]] = []
            for index, text in enumerate(data.get("text", [])):
                clean = _sanitize_text(text)
                if not clean:
                    continue
                try:
                    confidence = float(data.get("conf", ["-1"])[index])
                except (TypeError, ValueError):
                    confidence = -1
                if confidence < 0:
                    continue
                words.append(
                    {
                        "text": clean,
                        "left": int(data["left"][index]),
                        "top": int(data["top"][index]),
                        "width": int(data["width"][index]),
                        "height": int(data["height"][index]),
                    }
                )

            for row in _cluster_ocr_words_into_rows(words):
                parsed = _parse_simple_pricelist_ocr_line(_ocr_row_to_line(row))
                if parsed is not None:
                    parsed_rows.append(parsed)

    if not parsed_rows:
        return None
    return pd.DataFrame(parsed_rows).drop_duplicates(subset=["raw_name", "raw_unit", "raw_price"], keep="first")


def _is_pdf_noise_line(line: str) -> bool:
    return (
        not line
        or bool(re.match(r"^\d+\.\s+[A-Z][A-Z &,]+$", line))
        or line in {"PRICE", "(₱)", "GENERAL TERMS & NOTES"}
        or line.startswith("# MATERIAL NAME")
        or line.startswith("CONSTRUCTION MATERIALS")
        or line.startswith("Currency:")
        or line.startswith("Standard Price")
        or line.startswith("Construction Materials Reference Catalog")
        or line.startswith("•")
    )


def _looks_like_color_fragment(line: str) -> bool:
    words = [word.lower() for word in re.findall(r"[A-Za-z-]+", line)]
    return bool(words) and all(word in COLOR_WORDS for word in words)


def _extract_color_before_unit(tokens: list[str], unit_index: int) -> tuple[str | None, int]:
    color_tokens: list[str] = []
    i = unit_index - 1
    while i >= 0:
        token = tokens[i].strip("/,").lower()
        if token in COLOR_WORDS or tokens[i] == "/":
            color_tokens.insert(0, tokens[i].strip(","))
            i -= 1
            continue
        break
    return (" ".join(color_tokens).strip(" /") or None), i + 1


def _parse_collapsed_pdf_item(text: str) -> dict[str, str] | None:
    clean = re.sub(r"\s+", " ", text).strip()
    item_match = re.search(r"\b\d+\.\d+\s+", clean)
    if not item_match:
        return None
    price_matches = list(re.finditer(r"(?<![A-Za-z'\"])(?:[₱$]|p\s*)?\d[\d,]*(?:\.\d{1,2})?(?![A-Za-z'\"])", clean, re.I))
    if not price_matches:
        return None
    price_match = price_matches[-1]

    body = clean[item_match.end() : price_match.start()].strip()
    tokens = body.split()
    if len(tokens) < 4:
        return None

    unit_index = None
    for index in range(len(tokens) - 1, -1, -1):
        if _is_unit_value(tokens[index]):
            unit_index = index
            break
    if unit_index is None:
        return None

    unit = tokens[unit_index]
    color, color_start = _extract_color_before_unit(tokens, unit_index)
    brand_end = color_start if color_start < unit_index else unit_index
    brand_start = max(1, brand_end - 2)
    brand_tokens = tokens[brand_start:brand_end]

    name_desc_tokens = tokens[:brand_start]
    split_at = min(len(name_desc_tokens), 4)
    for index, token in enumerate(name_desc_tokens[1:], start=1):
        if token.lower().strip(",") in {
            "hydraulic", "blended", "grade", "non-load", "load", "water",
            "interior", "standard", "g.i.", "gauge", "series", "pn20",
            "plug-in", "unglazed", "rib", "permacoat", "premium", "alkyd",
        }:
            split_at = index
            break

    return {
        "raw_name": " ".join(name_desc_tokens[:split_at]).strip(),
        "description": " ".join(name_desc_tokens[split_at:]).strip(),
        "raw_brand": " ".join(brand_tokens).strip() or "Generic",
        "color": color or "",
        "raw_unit": unit,
        "raw_price": price_match.group(0),
    }


def _parse_collapsed_pdf_text(path: Path) -> pd.DataFrame | None:
    rows: list[dict[str, str]] = []
    current: list[str] = []
    pending_prefix: list[str] = []

    def flush_current() -> None:
        nonlocal current
        if current:
            parsed = _parse_collapsed_pdf_item(" ".join(current))
            if parsed is not None:
                rows.append(parsed)
        current = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for raw_line in (page.extract_text() or "").splitlines():
                line = re.sub(r"\s+", " ", raw_line).strip()
                if _is_pdf_noise_line(line):
                    continue
                if re.match(r"^\d+\.\d+\s+", line):
                    flush_current()
                    current = pending_prefix + [line]
                    pending_prefix = []
                    continue
                if current:
                    current.append(line)
                elif _looks_like_color_fragment(line):
                    pending_prefix = [line]
            flush_current()
            pending_prefix = []

    return pd.DataFrame(rows) if rows else None


def _parse_pdf_text(path: Path) -> pd.DataFrame:
    rows: list[dict[str, str]] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw_line in text.splitlines():
                line = re.sub(r"\s+", " ", raw_line).strip()
                if not line:
                    continue
                price_match = re.search(r"(?:₱|PHP|Php|P)?\s*\d[\d,]*(?:\.\d{1,2})?\s*$", line)
                if not price_match:
                    continue
                price_text = price_match.group(0)
                before_price = line[: price_match.start()].strip()
                parts = [part.strip() for part in re.split(r"\s{2,}|\|", before_price) if part.strip()]
                if len(parts) >= 2 and _is_unit_value(parts[-1]):
                    raw_name = " ".join(parts[:-1])
                    raw_unit = parts[-1]
                else:
                    unit_matches = list(re.finditer(rf"\b({_unit_pattern()})\b", before_price, re.I))
                    if not unit_matches:
                        continue
                    unit_match = _select_pdf_uom_match(unit_matches, before_price)
                    parsed_content = _split_flat_pdf_content(before_price[: unit_match.start()].strip())
                    raw_name = parsed_content["raw_name"]
                    raw_unit = unit_match.group(0)
                    rows.append(
                        {
                            "raw_name": raw_name,
                            "description": parsed_content["description"],
                            "raw_brand": parsed_content["raw_brand"],
                            "raw_unit": raw_unit,
                            "raw_price": price_text,
                        }
                    )
                    continue
                rows.append({"raw_name": raw_name, "raw_unit": raw_unit, "raw_price": price_text})
    if not rows:
        raise ValueError("No table found in PDF price list")
    return pd.DataFrame(rows)


def _parse_pdf_text_or_none(path: Path) -> pd.DataFrame | None:
    try:
        return _parse_pdf_text(path)
    except ValueError:
        return None


def _finalize_pdf_fallback_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = _dedupe_and_label_columns(df)
    df, _ = _normalize_columns(df)
    if "raw_unit" not in df.columns and "raw_name" in df.columns:
        df["raw_unit"] = df["raw_name"].map(_extract_unit_from_text)
    if not REQUIRED_COLUMNS.issubset(df.columns):
        return pd.DataFrame()
    if "raw_brand" not in df.columns:
        df["raw_brand"] = "Generic"
    df["raw_brand"] = df["raw_brand"].fillna("Generic")
    split_rows = df.apply(
        lambda row: _split_inline_brand_and_spec(
            row.get("raw_name"),
            row.get("raw_brand"),
            row.get("description") if "description" in df.columns else None,
        ),
        axis=1,
    )
    df["raw_name"] = split_rows.map(lambda row: row["raw_name"])
    df["raw_brand"] = split_rows.map(lambda row: row["raw_brand"])
    df["description"] = split_rows.map(lambda row: row["description"])
    split_units = split_rows.map(lambda row: row.get("raw_unit") or "")
    if "raw_unit" in df.columns:
        df["raw_unit"] = [
            split_unit or original_unit
            for split_unit, original_unit in zip(split_units, df["raw_unit"], strict=False)
        ]
    if "description" in df.columns:
        df["description"] = df["description"].map(_sanitize_text)
    if "color" in df.columns:
        df["color"] = df["color"].map(_sanitize_text)
    if "location" in df.columns:
        df["location"] = df["location"].map(_sanitize_text)
    df["raw_unit"] = df["raw_unit"].map(_sanitize_text)
    df["raw_price"] = df["raw_price"].map(_parse_price_value_with_ocr_cents)
    df = df[~df.apply(lambda row: _is_non_material_row(row["raw_name"], row["raw_price"]), axis=1)]
    return df.reset_index(drop=True)


def _is_metadata_column(column: Any) -> bool:
    key = _header_key(column)
    if key in {_header_key(value) for value in REQUIRED_COLUMNS | {"description", "raw_brand", "color", "location"}}:
        return True
    return any(
        token in key
        for token in (
            "item no", "item number", "item code", "material id", "code",
            "unit", "uom", "measure", "description", "material", "brand",
            "color", "quarter", "period", "year", "region", "location",
        )
    )


def _is_probable_location_price_column(df: pd.DataFrame, column: Any) -> bool:
    if _is_metadata_column(column):
        return False
    parsed_values = [_parse_price_value(value) for value in df[column]]
    prices = [value for value in parsed_values if value is not None]
    if not prices:
        return False
    if _is_probably_sequence(prices):
        return False
    non_blank_values = [value for value in df[column] if not _is_blank(value)]
    return len(prices) >= max(1, len(non_blank_values) // 2)


def expand_dpwh_deo_price_columns(df: pd.DataFrame, *, default_region: str | None = None) -> pd.DataFrame:
    """Convert DPWH CMPD wide DEO price columns into location-specific rows."""
    if df.empty or not {"raw_name", "raw_unit"}.issubset(df.columns):
        return df

    location_price_columns = [
        column
        for column in df.columns
        if column != "raw_price" and _is_probable_location_price_column(df, column)
    ]
    if not location_price_columns:
        return df

    rows: list[dict[str, Any]] = []
    passthrough_columns = [
        column
        for column in df.columns
        if column not in set(location_price_columns) | {"raw_price", "location"}
    ]
    for _, row in df.iterrows():
        for column in location_price_columns:
            price = _parse_price_value(row.get(column))
            if price is None:
                continue
            expanded_row = {column_name: row.get(column_name) for column_name in passthrough_columns}
            expanded_row["raw_price"] = price
            expanded_row["location"] = _sanitize_text(column)
            if default_region is not None and "region" not in expanded_row:
                expanded_row["region"] = default_region
            rows.append(expanded_row)

    if not rows:
        return df
    expanded = pd.DataFrame(rows)
    dedupe_columns = [
        column
        for column in ("material_code", "raw_name", "raw_unit", "raw_price", "location")
        if column in expanded.columns
    ]
    return expanded.drop_duplicates(subset=dedupe_columns, keep="first") if dedupe_columns else expanded


def _pdf_text_preview_dataframe(path: Path) -> pd.DataFrame | None:
    rows: list[dict[str, str]] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for raw_line in (page.extract_text() or "").splitlines():
                line = re.sub(r"\s+", " ", raw_line).strip()
                if not line or _is_pdf_noise_line(line):
                    continue
                price_match = re.search(r"(?:₱|PHP|Php|P)?\s*\d[\d,]*(?:\.\d{1,2})?\s*$", line)
                if not price_match:
                    continue
                before_price = line[: price_match.start()].strip()
                rows.append(
                    {
                        "Line Text": before_price,
                        "Detected Price": price_match.group(0),
                    }
                )
                if len(rows) >= 10:
                    break
            if len(rows) >= 10:
                break
    return pd.DataFrame(rows) if rows else None


def parse_pricelist_file(file_path: str, column_mapping: Mapping[str, str] | None = None) -> pd.DataFrame:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in (".xlsx", ".xls"):
        try:
            df = pd.read_excel(path, engine="openpyxl")
        except Exception:
            try:
                df = pd.read_excel(path)
            except KeyError as ek:
                raise ValueError(
                    "Reading Excel files requires the appropriate engine package (e.g. 'openpyxl' for .xlsx). "
                    "Install it in your environment and retry. Original error: %s" % ek
                ) from ek
            except Exception as exc_other:
                raise ValueError(f"Unable to read Excel file {file_path!r}: {exc_other}") from exc_other
    elif suffix == ".pdf":
        df = _parse_pdf(path)
    else:
        raise ValueError(f"Unsupported price list file type: {suffix!r}")

    try:
        df = _dedupe_and_label_columns(df)
    except ValueError as exc:
        if suffix == ".pdf" and column_mapping is None:
            preview = _pdf_text_preview_dataframe(path)
            if preview is not None:
                raise MissingColumnsError(
                    missing_columns=sorted(REQUIRED_COLUMNS),
                    available_columns=list(preview.columns),
                    detected_mapping={},
                    preview_rows=[
                        {str(column): _sanitize_text(value) for column, value in row.items()}
                        for row in preview.head(3).to_dict(orient="records")
                    ],
                ) from exc
        raise
    available_columns = list(df.columns)

    if column_mapping:
        unknown_columns = [column for column in column_mapping.values() if column not in df.columns]
        if unknown_columns:
            raise ValueError(f"Column mapping references columns not found in file: {sorted(unknown_columns)}")
        rename_map = {source_col: canonical for canonical, source_col in column_mapping.items() if source_col in df.columns}
        df = df.rename(columns=rename_map)

    df, detected_mapping = _normalize_columns(df)

    missing = REQUIRED_COLUMNS - set(df.columns)
    if "raw_unit" in missing and "raw_name" in df.columns:
        df["raw_unit"] = df["raw_name"].map(_extract_unit_from_text)
        missing = REQUIRED_COLUMNS - set(df.columns)

    if missing:
        if _has_unrelated_document_signals(df):
            raise ValueError("File NOT Supported")
        if len(available_columns) <= 3 and not any(_is_generic_column_name(column) for column in available_columns):
            raise MissingColumnsError(
                missing_columns=sorted(missing),
                available_columns=available_columns,
                detected_mapping=detected_mapping,
                preview_rows=[{str(column): _sanitize_text(value) for column, value in row.items()} for row in df.head(3).to_dict(orient="records")],
            )

        raise ValueError(f"Price list file is missing required column(s): {sorted(missing)}")

    if "raw_brand" not in df.columns:
        df["raw_brand"] = "Generic"

    df["raw_brand"] = df["raw_brand"].fillna("Generic")
    df["raw_brand"] = df["raw_brand"].apply(lambda x: "Generic" if (isinstance(x, str) and x.strip() == "") else x)

    df = df.copy()
    split_rows = df.apply(
        lambda row: _split_inline_brand_and_spec(
            row.get("raw_name"),
            row.get("raw_brand"),
            row.get("description") if "description" in df.columns else None,
        ),
        axis=1,
    )
    df["raw_name"] = split_rows.map(lambda row: row["raw_name"])
    df["raw_brand"] = split_rows.map(lambda row: row["raw_brand"])
    df["description"] = split_rows.map(lambda row: row["description"])
    split_units = split_rows.map(lambda row: row.get("raw_unit") or "")
    df["raw_unit"] = [
        split_unit or original_unit
        for split_unit, original_unit in zip(split_units, df["raw_unit"], strict=False)
    ]
    if "description" in df.columns:
        df["description"] = df["description"].map(_sanitize_text)
    if "color" in df.columns:
        df["color"] = df["color"].map(_sanitize_text)
    if "location" in df.columns:
        df["location"] = df["location"].map(_sanitize_text)
    df["raw_unit"] = df["raw_unit"].map(_sanitize_text)
    df["raw_price"] = df["raw_price"].map(_parse_price_value_with_ocr_cents)
    df = df[~df.apply(lambda row: _is_non_material_row(row["raw_name"], row["raw_price"], require_price=False), axis=1)]

    if df.empty and suffix == ".pdf" and column_mapping is None:
        text_fallback = _parse_pdf_text_or_none(path)
        if text_fallback is not None:
            df = _finalize_pdf_fallback_frame(text_fallback)

    if df.empty and suffix == ".pdf" and column_mapping is None:
        collapsed = _parse_collapsed_pdf_text(path)
        if collapsed is not None:
            df = _finalize_pdf_fallback_frame(collapsed)

    df = df.reset_index(drop=True)

    if df.empty:
        raise ValueError(
            "No material rows were found in this price list. For PDFs, make sure the file contains selectable text or a table, not only a scanned image."
        )

    if not _has_pricelist_relevance(df):
        raise ValueError("File NOT Supported")

    return df
