import os
import re
from pathlib import Path
from typing import Any

import pandas as pd
from pydantic import BaseModel, Field, ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential


MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")


class GeminiPricelistRowReview(BaseModel):
    row_index: int = Field(ge=0)
    status: str = Field(pattern="^(ok|needs_review)$")
    confidence: float = Field(ge=0.0, le=1.0)
    issue: str | None = Field(default=None, max_length=180)
    raw_name: str | None = Field(default=None, max_length=255)
    raw_unit: str | None = Field(default=None, max_length=30)
    raw_price: float | None = Field(default=None, gt=0)


class GeminiPricelistReview(BaseModel):
    rows: list[GeminiPricelistRowReview] = Field(default_factory=list)


def _text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _row_payload(df: pd.DataFrame, limit: int | None = 120) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    source_df = df if limit is None else df.head(limit)
    for row_index, row in enumerate(source_df.itertuples(index=False)):
        rows.append(
            {
                "row_index": row_index,
                "raw_name": _text(getattr(row, "raw_name", "")),
                "raw_unit": _text(getattr(row, "raw_unit", "")),
                "raw_price": _text(getattr(row, "raw_price", "")),
                "brand": _text(getattr(row, "raw_brand", "")),
                "description": _text(getattr(row, "description", "")),
                "region": _text(getattr(row, "region", "")),
                "location": _text(getattr(row, "location", "")),
            }
        )
    return rows


def should_review_with_gemini(file_path: str) -> bool:
    return Path(file_path).suffix.lower() == ".pdf" and bool(os.environ.get("GEMINI_API_KEY"))


def _looks_garbled(value: str) -> bool:
    text = _text(value)
    if not text:
        return False
    if re.search(r"[{}[\]|`_]{2,}", text):
        return True
    if re.search(r"\(\s*\(\s*[A-Za-z]|\b[iIl1]\s+[iIl1]|\bCS[ée]t[eé]\b|\bdrS\b", text):
        return True
    if _cleanup_material_name(text) is not None:
        return True
    letters = re.findall(r"[A-Za-zÀ-ÿ]", text)
    weird = re.findall(r"[^A-Za-zÀ-ÿ0-9\s.,/&()\"'°@+\-]", text)
    return len(letters) > 8 and len(weird) / max(len(text), 1) > 0.05


def _balanced_parentheses(value: str) -> str:
    text = value.strip()
    while text.startswith("(") and text.count("(") > text.count(")"):
        text = text[1:].strip()
    while text.endswith(")") and text.count(")") > text.count("("):
        text = text[:-1].strip()
    return text


def _cleanup_material_name(value: str) -> str | None:
    text = _text(value)
    if not text:
        return None
    cleaned = text

    junk_tail_patterns = [
        r"\s+pus\s+uta\s+apna\s+abner\s+oe\s+aroma\s+ae\b.*$",
        r"^assi\s+\(a\s+\(i\s+\(\s*ai\s+\(ai\s+\(\s*i\s+\(a\s+\(\s*aiat[ée]\s+i\s*ar\)?\b.*$",
        r"\s+assi\s+\(a\s+\(i\s+\(\s*ai\s+\(ai\s+\(\s*i\s+\(a\s+\(\s*aiat[ée]\s+i\s*ar\)?\b.*$",
        r"\s+rs\s+ie\b.*$",
        r"\s+N{5,}\S*\s+C+O?SO+T+T+S+Y?S?\b.*$",
        r"\s+[UW]{6,}[UW\s]*$",
    ]
    for pattern in junk_tail_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+[iIl1]\s+[iIl1]\S*.*$", "", cleaned)
    cleaned = re.sub(r"\s+\(\s*\(\s*[A-Za-z].*$", "", cleaned)
    cleaned = re.sub(r"\bCS[ée]t[eé]\b.*$", "", cleaned)
    cleaned = re.sub(r"\bdrS\b.*$", "", cleaned)
    cleaned = re.sub(r"\s*@\)\s*$", "", cleaned)
    cleaned = re.sub(r"\s*8\)\s*$", "", cleaned)
    cleaned = re.sub(r"[{}[\]|`_]+", " ", cleaned)
    cleaned = re.sub(r"\bPENETRATION\s*GRADE\b", "PENETRATION GRADE", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bEMULSIFIED\s*ASPHALT\b", "EMULSIFIED ASPHALT", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONIC\s*SSt\s*i\s*SWt\b.*$", "CATIONIC SS-1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONICSSt\s*i\s*SWt\b.*$", "CATIONIC SS-1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONIC\s*CRS\s*2\.2\b.*$", "CATIONIC CRS-2", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONICCRS\s*2\.2\b.*$", "CATIONIC CRS-2", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bRUST\s+CONVERTER/REMOVER\s+7\b", "RUST CONVERTER/REMOVER", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bGASOLINE,\s*REGULAR\s+as\b", "GASOLINE, REGULAR", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bFORM\s+OIL\s+T\b", "FORM OIL", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bMARINE\s+PLYWOOD\s+(\([^)]*\))\s+T\b", r"MARINE PLYWOOD \1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bORDINARY\s+PLYWOOD\s+(\([^)]*\))\s+[A-Za-z]{1,2}\b", r"ORDINARY PLYWOOD \1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:|")
    cleaned = re.sub(r"\s*\(\s*", " (", cleaned)
    cleaned = re.sub(r"\s*\)\s*", ") ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = _balanced_parentheses(cleaned)
    cleaned = re.sub(r"\s+[a-z]\s*$", "", cleaned)
    cleaned = re.sub(r"\s+[A-Z]\s*$", "", cleaned) if ")" not in cleaned[-4:] else cleaned
    cleaned = re.sub(r"\s+\.\s*$", "", cleaned)
    cleaned = _balanced_parentheses(cleaned)
    plywood_match = re.search(
        r"\b((?:ORDINARY|MARINE)\s+PLYWOOD)\s*\(([^)]*?)\)?$",
        cleaned,
        flags=re.IGNORECASE,
    )
    original_plywood_match = re.search(
        r"\b((?:ORDINARY|MARINE)\s+PLYWOOD)\s*\(([^)]*?\b8)\s*\)?",
        text,
        flags=re.IGNORECASE,
    )
    if original_plywood_match:
        plywood_match = original_plywood_match
    if plywood_match:
        label = re.sub(r"\s+", " ", plywood_match.group(1)).upper()
        dimensions = re.sub(r"\s*x\s*", " x ", plywood_match.group(2), flags=re.IGNORECASE).strip()
        if dimensions:
            cleaned = f"{label} ({dimensions})"

    if len(cleaned) < 4 or cleaned == text:
        return None
    return cleaned[:255]


def _cleanup_garbled_name(value: str) -> str | None:
    return _cleanup_material_name(value)


def _review_with_fallback(
    row_index: int,
    raw_name: str,
    *,
    confidence: float = 0.35,
    issue: str = "Possible PDF extraction artifact in material name",
) -> GeminiPricelistRowReview:
    corrected_name = _cleanup_garbled_name(raw_name)
    return GeminiPricelistRowReview(
        row_index=row_index,
        status="needs_review",
        confidence=confidence,
        issue=issue,
        raw_name=corrected_name,
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=6))
def _call_gemini(rows: list[dict[str, Any]], file_path: str) -> GeminiPricelistReview:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    pdf_bytes = Path(file_path).read_bytes()
    prompt = (
        "You are proofreading construction pricelist rows extracted from the attached PDF. "
        "Use the PDF as the source of truth. Compare the extracted rows with the document text/table. "
        "Fix obvious PDF/OCR extraction noise in material names, units, and prices. For example, remove "
        "garbled fragments, duplicated fragments, broken parentheses, stray symbols, and OCR garbage while "
        "preserving the real construction material name. "
        "Flag likely PDF/OCR/table extraction mistakes such as split names, wrong price cells, "
        "missing units, non-price values parsed as prices, duplicate fragments, or suspiciously incomplete rows. "
        "Return JSON only. Use row_index values exactly as provided. "
        "For rows with visibly garbled names, return status needs_review and include a corrected raw_name. "
        "Remove stray tail letters and OCR fragments outside the material name, including lone letters like j, t, i; "
        "unmatched leading/trailing parentheses; '@)'; '8)'; 'rs ie'; 'pus uta apna abner oe aroma ae'; and similar junk. "
        "Do not keep unfinished fragments such as 'Gasoline, Regular as' when the material is 'Gasoline, Regular'. "
        "Do not keep stray suffixes such as 'Rust Converter/Remover 7' when the material is 'Rust Converter/Remover'. "
        "Example: if the PDF row is aggregate base course and OCR adds junk like 'i iti CSété (( C drS', "
        "the corrected raw_name should be 'AGGREGATE BASECOURSE (CRUSHED)' or the exact clean wording visible in the PDF. "
        "Only include raw_unit or raw_price when the PDF supports the correction. "
        "Rows:\n"
        f"{rows}"
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=[prompt, types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiPricelistReview,
        ),
    )
    parsed = response.parsed
    if isinstance(parsed, GeminiPricelistReview):
        return parsed
    return GeminiPricelistReview.model_validate(parsed)


def review_pdf_rows(df: pd.DataFrame, file_path: str) -> dict[int, GeminiPricelistRowReview]:
    if Path(file_path).suffix.lower() != ".pdf":
        return {}

    all_rows = _row_payload(df, limit=None)
    if not all_rows:
        return {}

    flagged = {
        row["row_index"]: _review_with_fallback(row["row_index"], row.get("raw_name", ""))
        for row in all_rows
        if _cleanup_material_name(row.get("raw_name", "")) or _looks_garbled(row.get("raw_name", ""))
    }

    if not should_review_with_gemini(file_path):
        return flagged

    gemini_rows = _row_payload(df)
    try:
        review = _call_gemini(gemini_rows, file_path)
    except (Exception, ValidationError):
        return flagged

    for item in review.rows:
        if item.status == "needs_review":
            flagged[item.row_index] = item

    for row in all_rows:
        row_index = row["row_index"]
        raw_name = row.get("raw_name", "")
        fallback = _cleanup_material_name(raw_name)
        if row_index in flagged:
            item = flagged[row_index]
            if fallback and (not item.raw_name or _looks_garbled(item.raw_name)):
                flagged[row_index] = item.model_copy(update={"raw_name": fallback})
        elif fallback or _looks_garbled(raw_name):
            flagged[row_index] = _review_with_fallback(row_index, raw_name)
    return flagged
