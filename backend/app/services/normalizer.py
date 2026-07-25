import os
import re

from app.schemas.normalization import MaterialMatch
from app.services.normalizer_mock import ItemCandidate, normalize_material_mock


FALLBACK_CATEGORY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(concrete|cement|hollow block|chb|masonry|mortar|brick)\b", re.I), "Concrete & Masonry"),
    (re.compile(r"\b(rebar|deformed|steel|bar|iron|gi sheet|galvanized|metal|mesh)\b", re.I), "Steel & Metals"),
    (re.compile(r"\b(plywood|wood|timber|lumber|carpentry|marine plywood)\b", re.I), "Lumber & Carpentry"),
    (re.compile(r"\b(pipe|pvc|plumbing|sanitary|valve|fitting|trap|faucet)\b", re.I), "Plumbing"),
    (re.compile(r"\b(wire|cable|conduit|switch|outlet|breaker|panel|lighting|lamp)\b", re.I), "Electrical"),
    (re.compile(r"\b(paint|latex|enamel|primer|varnish|coating|tile|floor|ceiling)\b", re.I), "Finishes"),
    (re.compile(r"\b(sand|gravel|aggregate|stone|base course)\b", re.I), "Aggregates"),
    (re.compile(r"\b(roof|roofing|waterproof|membrane|bitumen|insulation)\b", re.I), "Roofing & Waterproofing"),
]


def _fallback_category(raw_name: str) -> str:
    for pattern, category in FALLBACK_CATEGORY_PATTERNS:
        if pattern.search(raw_name):
            return category
    return "Uncategorized"


def normalize_material(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
    use_mock: bool | None = None,
) -> MaterialMatch:
    if not candidates:
        return MaterialMatch(
            matched_item_code=None,
            confidence=0.0,
            category_type=_fallback_category(raw_name),
            item_name=raw_name,
            material=raw_name,
            brand="Generic",
            unit=raw_unit,
            is_new_item=True,
        )

    # Explicit per-call override (e.g. a per-upload UI choice) takes precedence
    # over the process-wide USE_MOCK_AI env var default.
    if use_mock is None:
        use_mock = os.getenv("USE_MOCK_AI", "true").lower() == "true"

    if use_mock:
        return normalize_material_mock(raw_name, raw_unit, candidates)

    from app.services.normalizer_gemini import normalize_material_gemini

    return normalize_material_gemini(raw_name, raw_unit, candidates)
