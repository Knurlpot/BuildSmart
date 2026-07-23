from difflib import SequenceMatcher
from typing import TypedDict

from app.schemas.normalization import MaterialMatch

MATCH_THRESHOLD = 0.6


class ItemCandidate(TypedDict):
    item_code: int
    category_type: str
    item_name: str
    material: str
    brand: str
    unit: str


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.strip().lower(), b.strip().lower()).ratio()


def normalize_material_mock(
    raw_name: str,
    raw_unit: str,
    candidates: list[ItemCandidate],
) -> MaterialMatch:
    if not candidates:
        raise ValueError("candidates must not be empty")

    best_candidate: ItemCandidate | None = None
    best_score = 0.0

    for candidate in candidates:
        name_score = _similarity(raw_name, candidate["item_name"])
        unit_score = _similarity(raw_unit, candidate["unit"])
        # name carries most of the signal; unit is a tiebreaker, not a gate,
        # since suppliers abbreviate units inconsistently (e.g. "kg" vs "kilo").
        score = name_score * 0.85 + unit_score * 0.15

        if score > best_score:
            best_score = score
            best_candidate = candidate

    assert best_candidate is not None

    is_new_item = best_score < MATCH_THRESHOLD

    return MaterialMatch(
        matched_item_code=None if is_new_item else best_candidate["item_code"],
        confidence=round(best_score, 4),
        category_type=best_candidate["category_type"],
        item_name=best_candidate["item_name"] if not is_new_item else raw_name,
        material=best_candidate["material"],
        brand=best_candidate["brand"],
        unit=best_candidate["unit"] if not is_new_item else raw_unit,
        is_new_item=is_new_item,
    )
