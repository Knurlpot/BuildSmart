import os

from app.schemas.normalization import MaterialMatch
from app.services.normalizer_gemini import normalize_material_gemini
from app.services.normalizer_mock import ItemCandidate, normalize_material_mock


def normalize_material(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
    use_mock: bool | None = None,
) -> MaterialMatch:
    # Explicit per-call override (e.g. a per-upload UI choice) takes precedence
    # over the process-wide USE_MOCK_AI env var default.
    if use_mock is None:
        use_mock = os.getenv("USE_MOCK_AI", "true").lower() == "true"

    if use_mock:
        return normalize_material_mock(raw_name, raw_unit, candidates)
    return normalize_material_gemini(raw_name, raw_unit, candidates)
