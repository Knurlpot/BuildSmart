import os

from app.schemas.normalization import MaterialMatch
from app.services.normalizer_mock import ItemCandidate, normalize_material_mock


def normalize_material_gemini(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
) -> MaterialMatch:
    raise NotImplementedError("Gemini normalization is not wired up yet")


def normalize_material(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
) -> MaterialMatch:
    use_mock = os.getenv("USE_MOCK_AI", "true").lower() == "true"

    if use_mock:
        return normalize_material_mock(raw_name, raw_unit, candidates)
    return normalize_material_gemini(raw_name, raw_unit, candidates)
