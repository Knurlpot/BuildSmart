import os
import re
from pathlib import Path
from typing import Any

import pandas as pd
from pydantic import BaseModel, Field, ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential


MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_REVIEW_BATCH_SIZE = int(os.environ.get("GEMINI_REVIEW_BATCH_SIZE", "40"))


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


def _normalize_asphalt_name(value: str) -> str:
    cleaned = value
    cleaned = re.sub(r"\bASPHALT,\s*RC\s*70\s+1\b", "ASPHALT, RC70", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bASPHALT,\s*RC70\s+1\b", "ASPHALT, RC70", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCUT-BACK\s*ASPHALT\s*,?\s*RC\s*B00\b", "CUT-BACK ASPHALT, RC800", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCUT-BACKASPHALT\s*,?\s*RCB00\b", "CUT-BACK ASPHALT, RC800", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCUT-BACK\s*ASPHALT\s*,?\s*RC\s*3000\s+0\b", "CUT-BACK ASPHALT, RC3000", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCUT-BACKASPHALT\s*,?\s*RC3000\s+0\b", "CUT-BACK ASPHALT, RC3000", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bEMULSIFIED\s*ASPHALT\b", "EMULSIFIED ASPHALT", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONIC\s*SSt\s*i\s*SWt\b.*$", "CATIONIC SS-1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONICSSt\s*i\s*SWt\b.*$", "CATIONIC SS-1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONIC\s*CRS\s*2\.2\b.*$", "CATIONIC CRS-2", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCATIONICCRS\s*2\.2\b.*$", "CATIONIC CRS-2", cleaned, flags=re.IGNORECASE)
    return cleaned


def _normalize_pipe_name(value: str) -> str:
    cleaned = value
    replacements = [
        (r"\bPVC\s+PIPE\s*\(2\s+1/2\"\s+163\s*mm\s*@\)\s*1\b", 'PVC PIPE (2 1/2" / 63 mm) (Series 1)'),
        (r"\bPVC\s+PIPE\s*\(3/4\s+19\s*mm\s*@\)\s*Sees\s*2\b", 'PVC PIPE (3/4" / 19-25 mm) (Series 2)'),
        (r"\bPVC\s+PIPE\s*\(1[°\"]\s+25\.4\s*mm\s+B\)", 'PVC PIPE (1" / 25.4 mm) (Series B)'),
        (r"\bPVC\s+PIPE\s*\(3\"\s+76\s*mm\s+9\)\s*rs\b", 'PVC PIPE 3" (76 mm) (Series 900)'),
        (r"\bPVC\s+PIPE\s*\(2\"\s+50\s*mm\s+9\)\s*ae\s*a\s*2\b", 'PVC PIPE 2" (50 mm)'),
        (r"\bPVC\s+PIPE\s*\(3\s+1/2\"\s+89\s*mm\s+9\)", 'PVC PIPE 3 1/2" (89 mm)'),
        (r"\bPVC\s+PIPE\s*\(4\"\s+101\s*mm\s*@\)?", 'PVC PIPE 4" (110 mm OD / 101 mm ID)'),
    ]
    for pattern, replacement in replacements:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\bPVC\s+PIPE\s*\((1\s*/?\s*1/2)\"?\s+(38\s*mm)\s*$", r"PVC PIPE (\1 \2)", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"\bGI\s+PIPE,\s*SCHEDULE\s+40\s*\((1\s+1/2\"?|1/2\"|3/4\"|1\"|3\"|4\"|5\"|6\"?)\s+([0-9.]+\s*mm)\s*$",
        lambda match: f"GI PIPE, SCHEDULE 40 ({match.group(1).rstrip(chr(34)) if match.group(1) == '6' else match.group(1)} {match.group(2)})",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\bREINFORCED\s+CONCRETE\s+PIPE,\s*CLASS\s+IV\s*\((36\")\s+(910\s*mm)\s*$", r"REINFORCED CONCRETE PIPE, CLASS IV (\1 \2)", cleaned, flags=re.IGNORECASE)
    return cleaned


def _normalize_concrete_lumber_name(value: str) -> str:
    cleaned = value
    cleaned = re.sub(r"\bCHB\s+LOAD\s+BEARING\s*\((6\"\s*x\s*8\"\s*x\s*16\")\s*$", r"CHB LOAD BEARING (\1)", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCHB\s+LOAD\s+BEARING\s*\((6\s*x\s*8[°\"]?\s*x\s*16\")\s*$", 'CHB LOAD BEARING (6" x 8" x 16")', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bOONCRETE\s*NEUTRALIZER\b", "CONCRETE NEUTRALIZER", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCOCO\s*LUMBERE\s*ET\b", "COCO LUMBER E.T.", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bLACQUER\s+THINNER\s+ES\s+aaa\b", "LACQUER THINNER ES AAA", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bQUICK-DRYING\s*ENAMEL\s*PAINT\b", "Quick-Drying Enamel Paint", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCONCRETE,\s*(3500\s*PSI\s*@\s*7\s*DAYS,\s*G1)\b", r"CONCRETE (\1)", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bCONCRETE,\s*(4000\s*PSI\s*@\s*28\s*DAYS,\s*Gi)\b", r"CONCRETE (\1)", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bGi\b", "G1", cleaned)
    return cleaned


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

    cleaned = _normalize_pipe_name(cleaned)
    cleaned = re.sub(r"\s+[iIl1]\s+[iIl1]\S*.*$", "", cleaned)
    cleaned = re.sub(r"\s+\(\s*\(\s*[A-Za-z].*$", "", cleaned)
    cleaned = re.sub(r"\bCS[ée]t[eé]\b.*$", "", cleaned)
    cleaned = re.sub(r"\bdrS\b.*$", "", cleaned)
    cleaned = re.sub(r"\s*@\)\s*$", "", cleaned)
    cleaned = re.sub(r"\s*8\)\s*$", "", cleaned)
    cleaned = re.sub(r"[{}[\]|`_]+", " ", cleaned)
    cleaned = re.sub(r"\bSTONE,\s*CLASS\s+B\s*\((30\s*-\s*70)\s*ka\)", r"STONE, CLASS B (\1 kg)", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bSTONE,\s*CLASS\s+D\s*\((100\s*-\s*200)\s*ka\)", r"STONE, CLASS D (\1 kg)", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPENETRATION\s*GRADE\b", "PENETRATION GRADE", cleaned, flags=re.IGNORECASE)
    cleaned = _normalize_asphalt_name(cleaned)
    cleaned = _normalize_concrete_lumber_name(cleaned)
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

    flagged = deterministic_pdf_reviews(df, file_path)

    if not should_review_with_gemini(file_path):
        return flagged

    for chunk_reviews in iter_gemini_pdf_reviews(df, file_path):
        flagged.update(chunk_reviews)
    return flagged


def deterministic_pdf_reviews(df: pd.DataFrame, file_path: str) -> dict[int, GeminiPricelistRowReview]:
    if Path(file_path).suffix.lower() != ".pdf":
        return {}

    all_rows = _row_payload(df, limit=None)
    if not all_rows:
        return {}

    return {
        row["row_index"]: _review_with_fallback(row["row_index"], row.get("raw_name", ""))
        for row in all_rows
        if _cleanup_material_name(row.get("raw_name", "")) or _looks_garbled(row.get("raw_name", ""))
    }


def iter_gemini_pdf_reviews(
    df: pd.DataFrame,
    file_path: str,
    *,
    batch_size: int = GEMINI_REVIEW_BATCH_SIZE,
):
    if not should_review_with_gemini(file_path):
        return

    all_rows = _row_payload(df, limit=None)
    if not all_rows:
        return

    batch_size = max(1, batch_size)
    for start in range(0, len(all_rows), batch_size):
        batch_rows = all_rows[start : start + batch_size]
        try:
            review = _call_gemini(batch_rows, file_path)
        except (Exception, ValidationError):
            yield {}
            continue

        flagged: dict[int, GeminiPricelistRowReview] = {}
        for item in review.rows:
            if item.status != "needs_review":
                continue
            row = all_rows[item.row_index] if 0 <= item.row_index < len(all_rows) else None
            fallback = _cleanup_material_name(row.get("raw_name", "")) if row is not None else None
            if fallback and (not item.raw_name or _looks_garbled(item.raw_name)):
                item = item.model_copy(update={"raw_name": fallback})
            flagged[item.row_index] = item
        yield flagged
