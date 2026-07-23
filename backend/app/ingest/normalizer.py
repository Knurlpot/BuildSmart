import os
import re
from typing import Any

from pydantic import BaseModel, ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

from app.ingest.schemas import NormalizedItem

MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
API_KEY = os.environ.get("GEMINI_API_KEY")

_client = None
_types = None
_APIError = None


def _ensure_gemini_client() -> None:
    global _client, _types, _APIError
    if _client is not None:
        return

    try:
        from google import genai
        from google.genai import types
        from google.genai.errors import APIError
    except ImportError as exc:
        raise ImportError(
            "Gemini normalizer dependencies are not installed. "
            "Install google-genai or disable DPWH/PSA normalization until available."
        ) from exc

    _client = genai.Client(api_key=API_KEY)
    _types = types
    _APIError = APIError


class GeminiNormalizedResponse(BaseModel):
    standardized_name: str
    category: str
    unit: str
    unit_cost: float
    brand_or_type: str | None = None
    grade: str | None = None
    dimensions: str | None = None
    is_flagged: bool = False
    flag_reason: str | None = None


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=10))
def _call_gemini(prompt: str) -> dict[str, Any]:
    _ensure_gemini_client()
    response = _client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiNormalizedResponse,
        ),
    )
    return response.parsed


def build_normalization_prompt(row: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
    candidate_lines = "\n".join(
        f"- {c['item_code']}: {c['item_name']} ({c['unit']})"
        for c in candidates[:20]
    )
    return (
        "You are normalizing a construction price list row from DPWH or PSA. "
        "Return JSON with standardized_name, category, unit, unit_cost, brand_or_type, grade, dimensions, is_flagged, flag_reason. "
        "Do not add any extra fields."
        f"\n\nRaw row: {row}\n\nCandidates:\n{candidate_lines}"
    )


def _clean_price(value: Any) -> float:
    if value is None:
        raise ValueError("Missing price")
    if isinstance(value, str):
        cleaned = re.sub(r"[₱,\sA-Za-z]+", "", value)
        return float(cleaned)
    return float(value)


def normalize_row(row: dict[str, Any], candidates: list[dict[str, Any]]) -> NormalizedItem:
    prompt = build_normalization_prompt(row, candidates)
    parsed = _call_gemini(prompt)

    try:
        validated = GeminiNormalizedResponse(**parsed)
    except ValidationError as exc:
        raise ValueError(f"Gemini response validation failed: {exc}")

    if validated.is_flagged and not validated.flag_reason:
        validated.flag_reason = "Unable to normalize row cleanly"

    return NormalizedItem(
        item_code=row.get("item_code"),
        raw_material_name=row["raw_material_name"],
        standardized_name=validated.standardized_name,
        category=validated.category,
        specifications={
            "grade": validated.grade,
            "dimensions": validated.dimensions,
            "brand_or_type": validated.brand_or_type,
        },
        unit=validated.unit,
        unit_cost=validated.unit_cost,
        region=row.get("region"),
        quarter=row.get("quarter"),
        year=row.get("year"),
        is_flagged=validated.is_flagged,
        flag_reason=validated.flag_reason,
    )
