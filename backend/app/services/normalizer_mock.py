from difflib import SequenceMatcher
import re
from typing import TypedDict

from app.schemas.normalization import MaterialMatch

MATCH_THRESHOLD = 0.6


ALIAS_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bRCP\b", re.I), "reinforced concrete pipe"),
    (re.compile(r"\bREINF(?:ORCED)?\.?\s+CONC(?:RETE)?\.?\s+PIPE\b", re.I), "reinforced concrete pipe"),
    (re.compile(r"\bG\.?\s*I\.?\s+PIPE\b", re.I), "galvanized iron pipe"),
    (re.compile(r"\bGI\s+PIPE\b", re.I), "galvanized iron pipe"),
    (re.compile(r"\bPVC\s+PIPE\b", re.I), "polyvinyl chloride pipe"),
    (re.compile(r"\bCHB\b", re.I), "concrete hollow block"),
    (re.compile(r"\bCUT[-\s]*BACK\s*ASPHALT\b", re.I), "cutback asphalt"),
    (re.compile(r"\bRC\s*[- ]?\s*(70|250|800|3000)\b", re.I), r"rc\1"),
    (re.compile(r"\bMC\s*[- ]?\s*(70|250|800|3000)\b", re.I), r"mc\1"),
    (re.compile(r"\bSS\s*[- ]?\s*1\b", re.I), "ss1"),
    (re.compile(r"\bCRS\s*[- ]?\s*2\b", re.I), "crs2"),
    (re.compile(r"\bSCHEDULE\s*40\b", re.I), "schedule40"),
    (re.compile(r"\bCLASS\s*IV\b", re.I), "class4"),
    (re.compile(r"\bG\s*1\b", re.I), "g1"),
]


def _canonical_text(value: str) -> str:
    text = (value or "").strip().lower()
    for pattern, replacement in ALIAS_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    text = text.replace("°", '"')
    text = re.sub(r"\b(\d+)\s*/\s*(\d+)\b", r"\1/\2", text)
    text = re.sub(r"\b(\d+)\s+(\d+/\d+)\"?\b", r"\1 \2", text)
    text = re.sub(r"(\d(?:\.\d+)?)\s*mm\b", r"\1mm", text)
    text = re.sub(r"(\d(?:\.\d+)?)\s*kg\b", r"\1kg", text)
    text = re.sub(r"(\d(?:\.\d+)?)\s*psi\b", r"\1psi", text)
    text = re.sub(r"[\"'(),./-]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class ItemCandidate(TypedDict):
    item_code: int
    category_type: str
    item_name: str
    material: str
    brand: str
    unit: str


def _similarity(a: str, b: str) -> float:
    left = _canonical_text(a)
    right = _canonical_text(b)
    sequence_score = SequenceMatcher(None, left, right).ratio()
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return sequence_score
    overlap_score = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
    return max(sequence_score, overlap_score)


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

    if best_candidate is None:
        return MaterialMatch(
            matched_item_code=None,
            confidence=0.0,
            category_type="Others",
            item_name=raw_name,
            material=raw_name,
            brand="Generic",
            unit=raw_unit,
            is_new_item=True,
        )

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
