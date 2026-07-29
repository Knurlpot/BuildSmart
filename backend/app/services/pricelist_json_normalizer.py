import re
from typing import Any

from app.schemas.pricelist import (
    CategoryType,
    MaterialSpecifications,
    NormalizedPriceRecord,
    SourceAgency,
    UnitType,
)

_UNIT_MAP: dict[str, UnitType] = {
    "pc": "piece",
    "pcs": "piece",
    "piece": "piece",
    "pieces": "piece",
    "ea": "piece",
    "each": "piece",
    "bd.ft": "board_foot",
    "bd.ft.": "board_foot",
    "bdft": "board_foot",
    "bft": "board_foot",
    "bd ft": "board_foot",
    "bdft.": "board_foot",
    "cu.m": "cubic_meter",
    "cu.m.": "cubic_meter",
    "cu meter": "cubic_meter",
    "cu. meter": "cubic_meter",
    "cubic meter": "cubic_meter",
    "m3": "cubic_meter",
    "m 3": "cubic_meter",
    "kg": "kilogram",
    "kgs": "kilogram",
    "kilogram": "kilogram",
    "kilograms": "kilogram",
    "kilo": "kilogram",
    "bag": "bag",
    "bags": "bag",
    "sack": "bag",
    "sacks": "bag",
    "length": "length",
    "lgth": "length",
    "len": "length",
    "meter": "length",
    "m": "length",
    "mtr": "length",
    "mt": "length",
    "sheet": "sheet",
    "sht": "sheet",
    "gallon": "gallon",
    "gal": "gallon",
    "box": "box",
    "bundle": "bundle",
    "roll": "roll",
}

_CATEGORY_PATTERNS: list[tuple[re.Pattern[str], CategoryType]] = [
    (re.compile(r"\b(concrete|cement|hollow block|chb|masonry|mortar|brick)\b", re.I), "Concrete & Masonry"),
    (re.compile(r"\b(rebar|steel|bar|iron|gi sheet|galvanized|metal|mesh)\b", re.I), "Steel & Structural Metals"),
    (re.compile(r"\b(wood|timber|plywood|lumber|carpentry|decking|sawn timber|chipboard)\b", re.I), "Lumber & Carpentry"),
    (re.compile(r"\b(roof|roofing|waterproof|insulation|membrane|bitumen|felt|waterproofing)\b", re.I), "Thermal & Moisture Protection (Roofing/Waterproofing)"),
    (re.compile(r"\b(pipe|plumbing|sanitary|valve|tap|flange|trap|fitting|cistern|manhole)\b", re.I), "Plumbing & Sanitary"),
    (re.compile(r"\b(electrical|lighting|wire|cable|conduit|lamp|fixture|switch|socket|breaker|panel)\b", re.I), "Electrical & Lighting"),
    (re.compile(r"\b(paint|enamel|latex|varnish|primer|coating|finish|stain|sealant)\b", re.I), "Paints & Finishes"),
    (re.compile(r"\b(sand|gravel|aggregate|stone|pea gravel|river sand|crushed stone)\b", re.I), "Aggregates (Sand & Gravel)"),
]


def _normalize_unit(raw_unit: str) -> UnitType:
    if not raw_unit:
        return "other"

    cleaned = raw_unit.strip().lower()
    cleaned = re.sub(r"[\s\u00A0/\\]+", " ", cleaned)
    cleaned = re.sub(r"[^a-z0-9\. ]", "", cleaned)
    cleaned = cleaned.strip()

    if cleaned in _UNIT_MAP:
        return _UNIT_MAP[cleaned]

    if re.fullmatch(r"\d+\s?mm", cleaned) or re.fullmatch(r"\d+\s?in(ches?)?", cleaned):
        return "length"
    if re.fullmatch(r"\d+\s?kg", cleaned):
        return "kilogram"
    if re.fullmatch(r"\d+\s?m", cleaned):
        return "length"
    if re.search(r"\bpc\b|\bpcs\b|\bpiece\b", cleaned):
        return "piece"
    if re.search(r"\bcu\b|\bm3\b|\bcubic\b", cleaned):
        return "cubic_meter"
    if re.search(r"\bkilogram\b|\bkg\b", cleaned):
        return "kilogram"
    if re.search(r"\bbag\b|\bsack\b", cleaned):
        return "bag"
    if re.search(r"\b(gallon|gal)\b", cleaned):
        return "gallon"
    if re.search(r"\b(sheet|sht)\b", cleaned):
        return "sheet"
    if re.search(r"\b(box|bundle|roll)\b", cleaned):
        return _UNIT_MAP.get(cleaned, "other")

    return "other"


def _canonicalize_name(raw_name: str, raw_unit: str) -> tuple[str, CategoryType]:
    text = raw_name.strip()
    normalized = text
    lower = text.lower()

    def _find(pattern: str) -> re.Match[str] | None:
        return re.search(pattern, lower)

    if "cement" in lower:
        type_match = _find(r"type\s*([1-9ivx]+)|t\s*1|t1|type\s*i\b")
        type_label = "Type 1" if type_match else "Type 1"
        weight_match = _find(r"(40\s*kg|40kg|50\s*kg|50kg|25\s*kg|25kg)")
        size_label = "40kg Bag" if weight_match is None else weight_match.group(1).replace(" ", "")
        return f"Portland Cement ({type_label}, {size_label})", "Concrete & Masonry"

    if re.search(r"\b(chb|concrete hollow block|hollow block)\b", lower):
        size = "4-inch"
        size_match = _find(r"(\d+(?:\.\d+)?)["" ]?\s*-?inch")
        if size_match:
            size = f"{size_match.group(1)}-inch"
        elif _find(r"\b4\b"):
            size = "4-inch"
        load = "Non-Load Bearing" if re.search(r"non[- ]?load|nonload", lower) else "Load Bearing" if re.search(r"load[- ]?bearing|load bearing", lower) else "Non-Load Bearing"
        return f"Concrete Hollow Block ({size} {load})", "Concrete & Masonry"

    if re.search(r"\b(deformed steel bar|deformd steel bar|deformed bar|deformd bar|rebar|steel bar)\b", lower):
        grade = _find(r"\bgrade\s*(\d+)|\bg\s*(\d+)|\bgr\s*(\d+)\b")
        grade_label = f"Grade {grade.group(1)}" if grade else "Grade 40"
        diameter = _find(r"(\d+(?:\.\d+)?)\s*mm")
        diameter_label = f"{diameter.group(1)}mm" if diameter else "12mm"
        length_suffix = "x 6m"
        return f"Deformed Steel Bar ({grade_label}, {diameter_label} {length_suffix})", "Steel & Structural Metals"

    if re.search(r"\b(pvc pipe|pipe|pvc conduit)\b", lower):
        size = _find(r"(\d+(?:\.\d+)?)\s*-?\s*inch")
        schedule = _find(r"schedule\s*(\d+)")
        size_label = f"{size.group(1)}-inch" if size else "4-inch"
        schedule_label = f", Schedule {schedule.group(1)}" if schedule else ""
        return f"PVC Pipe ({size_label}{schedule_label})", "Plumbing & Sanitary"

    if re.search(r"\b(galvanized iron sheet|gi sheet|galvanized sheet)\b", lower):
        thickness = _find(r"(\d+(?:\.\d+)?)\s*mm")
        thickness_label = f" ({thickness.group(1)}mm)" if thickness else ""
        return f"Galvanized Iron Sheet{thickness_label}", "Steel & Structural Metals"

    if re.search(r"\b(plywood|marine plywood)\b", lower):
        gauge = _find(r"(\d+(?:\/\d+)?)(?:\s*\")?\b")
        gauge_label = f"{gauge.group(1)}\"" if gauge else "3/4\""
        dimension = _find(r"(\d+)\s*[xX]\s*(\d+)")
        dimension_label = f"{dimension.group(1)} ft x {dimension.group(2)} ft" if dimension else "4 ft x 8 ft"
        return f"Marine Plywood ({gauge_label} x {dimension_label})", "Lumber & Carpentry"

    if re.search(r"\b(latex paint|paint|enamel|primer|coating)\b", lower):
        color = _find(r"\b(white|black|gray|grey|beige|cream|red|blue|green|yellow|brown)\b")
        color_label = f" ({color.group(1).capitalize()})" if color else ""
        return f"Latex Paint{color_label}", "Paints & Finishes"

    if re.search(r"\b(sand|gravel|aggregate|stone)\b", lower):
        return text.title(), "Aggregates (Sand & Gravel)"

    if re.search(r"\b(roof|roofing|waterproof|membrane|insulation|bitumen)\b", lower):
        return text.title(), "Thermal & Moisture Protection (Roofing/Waterproofing)"

    if re.search(r"\b(electrical|wire|cable|conduit|lamp|fixture|switch|socket)\b", lower):
        return text.title(), "Electrical & Lighting"

    if re.search(r"\b(pipe|valve|tap|fitting|sanitary|cistern)\b", lower):
        return text.title(), "Plumbing & Sanitary"

    return text.title(), "Others"


def _extract_specifications(raw_name: str) -> MaterialSpecifications:
    lower = raw_name.lower()
    specs = MaterialSpecifications()

    def _search(pattern: str) -> list[str]:
        return re.findall(pattern, lower)

    dimension_match = re.search(r"(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?)", lower)
    if dimension_match:
        specs.dimensions = dimension_match.group(1).replace(" ", "")

    thickness_match = re.search(r"(\d+(?:\.\d+)?\s*(?:mm|millimeter|inch|inches|\"|')|\b3/4\b)", lower)
    if thickness_match:
        specs.thickness = thickness_match.group(1).replace('"', 'in').strip()

    grade_match = re.search(r"\b(?:grade|g|gr)\s*(\d+)\b", lower)
    if grade_match:
        specs.grade = grade_match.group(1)

    type_match = re.search(r"\btype\s*([1-9ivx]+)\b", lower)
    if type_match:
        specs.other["type"] = type_match.group(1).upper()

    schedule_match = re.search(r"\bschedule\s*(\d+)\b", lower)
    if schedule_match:
        specs.schedule = schedule_match.group(1)

    weight_match = re.search(r"(\d+(?:\.\d+)?\s*(?:kg|kilogram|kgs))", lower)
    if weight_match:
        specs.weight = weight_match.group(1).replace(" ", "")

    volume_match = re.search(r"(\d+(?:\.\d+)?\s*(?:m3|cu\.?m|cubic meter))", lower)
    if volume_match:
        specs.volume = volume_match.group(1).replace(" ", "")

    if "schedule" in lower and specs.schedule is None:
        specs.schedule = "40"

    if "marine" in lower and "plywood" in lower:
        specs.other["grade"] = "Marine"

    if "non-load" in lower or "non load" in lower or "nonload" in lower:
        specs.other["load"] = "Non-Load Bearing"
    elif "load bearing" in lower or "load-bearing" in lower:
        specs.other["load"] = "Load Bearing"

    return specs


def _parse_price(raw_price: Any) -> tuple[float | None, str | None]:
    if raw_price is None:
        return None, "Missing price"

    if isinstance(raw_price, (int, float)):
        return float(raw_price), None

    price_text = str(raw_price).strip()
    if price_text == "":
        return None, "Missing price"

    cleaned = re.sub(r"[₱$€,\s]", "", price_text)
    cleaned = cleaned.replace("PHP", "")
    try:
        value = float(cleaned)
        return value, None
    except ValueError:
        return None, f"Invalid price value: {raw_price}"


def normalize_pricelist_dataframe(
    df,
    source_agency: SourceAgency,
    region: str | None = None,
) -> list[NormalizedPriceRecord]:
    records: list[NormalizedPriceRecord] = []

    for row in df.itertuples(index=False):
        raw_name = getattr(row, "raw_name", "")
        raw_unit = getattr(row, "raw_unit", "")
        raw_price = getattr(row, "raw_price", None)

        canonical_name, category = _canonicalize_name(raw_name, raw_unit)
        unit = _normalize_unit(raw_unit)
        specs = _extract_specifications(raw_name)
        price_value, price_error = _parse_price(raw_price)

        is_flagged = False
        flag_reasons: list[str] = []

        if price_error:
            is_flagged = True
            flag_reasons.append(price_error)

        if not raw_unit or unit == "other":
            is_flagged = True
            if raw_unit and unit == "other":
                flag_reasons.append(f"Unrecognized unit: {raw_unit}")
            else:
                flag_reasons.append("Missing unit")

        if source_agency not in {"DPWH", "PSA", "Supplier", "Internal"}:
            is_flagged = True
            flag_reasons.append(f"Unsupported source agency: {source_agency}")

        flag_reason = "; ".join(flag_reasons) if flag_reasons else None

        record = NormalizedPriceRecord(
            source_agency=source_agency,
            region=region,
            raw_name=raw_name,
            raw_unit=raw_unit,
            raw_price=price_value,
            item_name=canonical_name,
            category=category,
            specifications=specs,
            unit=unit,
            price=price_value,
            is_flagged=is_flagged,
            flag_reason=flag_reason,
        )
        records.append(record)

    return records
