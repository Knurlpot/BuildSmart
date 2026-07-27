import os
import re

from app.schemas.normalization import MaterialMatch
from app.services.normalizer_mock import ItemCandidate, normalize_material_mock
from app.services.categories import CATEGORY_TYPES


# Patterns map common raw-text signals to one of the canonical `CATEGORY_TYPES`.
FALLBACK_CATEGORY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(concrete|cement|ready[- ]mix|mortar|grout)\b", re.I), "Concrete & Masonry"),
    (re.compile(r"\b(rebar|deformed|steel|bar|mesh|metal|gi|galvanized)\b", re.I), "Reinforcement & Steel"),
    (re.compile(r"\b(plywood|wood|timber|lumber|plywood|decking)\b", re.I), "Timber & Lumber"),
    (re.compile(r"\b(roof|roofing|shingle|membrane|underlayment)\b", re.I), "Roofing"),
    (re.compile(r"\b(insulation|vapor barrier|thermal|acoustic)\b", re.I), "Insulation & Waterproofing"),
    (re.compile(r"\b(brick|block|masonry|stone|aggregate|sand|gravel)\b", re.I), "Masonry Units & Blocks"),
    (re.compile(r"\b(door|window|glaze|glazing|frame)\b", re.I), "Doors, Windows & Glazing"),
    (re.compile(r"\b(paint|latex|enamel|primer|varnish|coating|sealant)\b", re.I), "Paints, Coatings & Sealants"),
    (re.compile(r"\b(tile|ceramic|porcelain|hardwood|vinyl|flooring|epoxy)\b", re.I), "Flooring & Tiles"),
    (re.compile(r"\b(ceiling|suspended|acoustic tile|grid)\b", re.I), "Ceilings & Suspended Systems"),
    (re.compile(r"\b(pipe|pvc|plumbing|valve|fitting|fixture|sanitary)\b", re.I), "Plumbing & Pipework"),
    (re.compile(r"\b(hvac|air[- ]handling|duct|chiller|boiler)\b", re.I), "HVAC & Mechanical"),
    (re.compile(r"\b(wire|cable|conduit|switch|outlet|panel|lighting|lamp)\b", re.I), "Electrical & Lighting"),
    (re.compile(r"\b(bolt|screw|anchor|hinge|lock|fastener)\b", re.I), "Hardware & Fasteners"),
    (re.compile(r"\b(adhesive|glue|tape|bonding)\b", re.I), "Adhesives & Tapes"),
    (re.compile(r"\b(tool|drill|saw|equipment|consumable)\b", re.I), "Tools, Equipment & Consumables"),
    (re.compile(r"\b(helmet|harness|ppe|safety|guard)\b", re.I), "Safety & PPE"),
    (re.compile(r"\b(landscape|paver|soil|irrigation|geotextile)\b", re.I), "Landscaping & Siteworks"),
    (re.compile(r"\b(fireproof|waterproofing|acoustic|specialty|system)\b", re.I), "Specialty Materials & Systems"),
]


def _fallback_category(raw_name: str) -> str:
    raw = (raw_name or "").strip()
    for pattern, category in FALLBACK_CATEGORY_PATTERNS:
        if pattern.search(raw):
            return category
    # Prefer 'Finishing' for vague interior terms, otherwise fall back to
    # the legacy 'Uncategorized' label when nothing matches.
    if re.search(r"\b(paint|finish|plaster|drywall|tile|floor)\b", raw, re.I):
        return "Finishing"
    return "Uncategorized"


def normalize_material(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
    raw_brand: str | None = None,
    use_mock: bool | None = None,
) -> MaterialMatch:
    if not candidates:
        return MaterialMatch(
            matched_item_code=None,
            confidence=0.0,
            category_type=_fallback_category(raw_name),
            item_name=raw_name,
            material=raw_name,
            brand=raw_brand or "Generic",
            unit=raw_unit,
            is_new_item=True,
        )

    # Explicit per-call override (e.g. a per-upload UI choice) takes precedence
    # over the process-wide USE_MOCK_AI env var default.
    if use_mock is None:
        use_mock = os.getenv("USE_MOCK_AI", "true").lower() == "true"

    if use_mock:
        result = normalize_material_mock(raw_name, raw_unit, candidates)
    else:
        from app.services.normalizer_gemini import normalize_material_gemini

        result = normalize_material_gemini(raw_name, raw_unit, candidates)
    
    # Override brand with raw_brand if it was provided
    if raw_brand and raw_brand != "Generic":
        result.brand = raw_brand
    elif raw_brand == "Generic":
        result.brand = "Generic"
    
    return result
