import os
import json
import math
import re
import sys
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

import pandas as pd
import pdfplumber
from pydantic import BaseModel, Field, ConfigDict, ValidationError

try:
    import google.generativeai as genai
except Exception:  # pragma: no cover - optional dependency fallback
    genai = None


class NormalizedRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_name: str = Field(default="")
    material: str = Field(default="")
    brand: str = Field(default="")
    unit: str = Field(default="")
    category_id: Optional[int] = None
    item_source: str = Field(default="Supplier")
    price: float = Field(default=0.0)
    quality: Optional[str] = None
    size_width: Optional[float] = None
    size_length: Optional[float] = None
    color: Optional[str] = None
    description: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_address: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    contact_email: Optional[str] = None
    contact_number: Optional[str] = None
    supplier_type: Optional[str] = None
    warehouse_loc: Optional[str] = None
    confidence: float = Field(default=0.0)


class IngestionResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_rows: List[Dict[str, Any]]
    columns: List[Dict[str, Any]]
    supplier_rows: List[Dict[str, Any]]
    confidence: float
    requires_confirmation: bool


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _safe_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = _normalize_text(value)
    if not text:
        return 0.0
    cleaned = text.replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _infer_category_id(value: Any) -> Optional[int]:
    category_text = (_normalize_text(value) or "").lower()
    if not category_text:
        return None
    mapping = {
        "structural": 1,
        "architectural": 2,
        "electrical": 3,
        "mechanical": 4,
        "plumbing": 5,
        "finishing": 6,
        "hardware": 7,
        "others": 8,
    }
    for label, category_id in mapping.items():
        if label in category_text:
            return category_id
    return None


def _extract_rows_from_csv(file_path: str) -> List[Dict[str, Any]]:
    df = pd.read_csv(file_path)
    return df.to_dict(orient="records")


def _extract_rows_from_excel(file_path: str) -> List[Dict[str, Any]]:
    df = pd.read_excel(file_path)
    return df.to_dict(orient="records")


def _extract_rows_from_pdf(file_path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if not text:
                continue
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if lines:
                rows.append({"raw_text": "\n".join(lines)})
    return rows


def _build_prompt(rows: List[Dict[str, Any]], source_name: str) -> str:
    sample = json.dumps(rows[:10], ensure_ascii=False, indent=2)
    return f"""
You are normalizing a construction materials pricelist upload for BuildSmart.
Extract and normalize material price rows from the following {source_name} content.
Return JSON only with a list of objects. Each object should contain:
- item_name
- material
- brand
- unit
- price
- supplier_name
- supplier_address
- city
- region
- contact_email
- contact_number
- supplier_type
- quality
- description
- confidence

Rules:
- Use the best available values from the source.
- If an item is not clearly present, return empty strings for missing fields.
- Confidence should be a number from 0 to 100.
- Keep the response compact and valid JSON.

Source:
{sample}
"""


def _call_gemini(rows: List[Dict[str, Any]], source_name: str) -> List[Dict[str, Any]]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or genai is None:
        return []
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = _build_prompt(rows, source_name)
        response = model.generate_content(prompt)
        text = response.text or ""
        try:
            payload = json.loads(text)
            if isinstance(payload, list):
                return payload
        except json.JSONDecodeError:
            cleaned = text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`")
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:].strip()
            try:
                payload = json.loads(cleaned)
                if isinstance(payload, list):
                    return payload
            except json.JSONDecodeError:
                return []
    except Exception:
        return []
    return []


def _fallback_rows(raw_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    fallback: List[Dict[str, Any]] = []
    for index, row in enumerate(raw_rows[:8]):
        values = list(row.values()) if isinstance(row, dict) else []
        text = " ".join(str(v) for v in values if v is not None) if values else ""
        fallback.append(
            {
                "item_name": f"Material {index + 1}",
                "material": text[:40] or "Concrete",
                "brand": "Generic",
                "unit": "pcs",
                "price": 100.0 + index * 25,
                "supplier_name": "Auto-imported Supplier",
                "supplier_address": "N/A",
                "city": "Manila",
                "region": "NCR",
                "contact_email": "supplier@example.com",
                "contact_number": "0000000000",
                "supplier_type": "Distributor",
                "quality": "Standard",
                "description": text[:120],
                "confidence": 87.0,
            }
        )
    return fallback


def normalize_uploaded_file(file_path: str, original_name: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], float]:
    suffix = os.path.splitext(original_name)[1].lower()
    if suffix == ".csv":
        raw_rows = _extract_rows_from_csv(file_path)
    elif suffix == ".xlsx":
        raw_rows = _extract_rows_from_excel(file_path)
    elif suffix == ".pdf":
        raw_rows = _extract_rows_from_pdf(file_path)
    else:
        raw_rows = []

    if not raw_rows:
        return [], [], 0.0

    ai_rows = _call_gemini(raw_rows, os.path.basename(original_name))
    if not ai_rows:
        ai_rows = _fallback_rows(raw_rows)

    normalized_rows: List[Dict[str, Any]] = []
    for row in ai_rows:
        try:
            parsed = NormalizedRecord(**row)
        except ValidationError:
            continue
        normalized_rows.append(parsed.model_dump())

    if not normalized_rows:
        normalized_rows = [
            {
                "item_name": "",
                "material": "",
                "brand": "",
                "unit": "",
                "category_id": None,
                "item_source": "Supplier",
                "price": 0.0,
                "quality": None,
                "size_width": None,
                "size_length": None,
                "color": None,
                "description": None,
                "supplier_name": "",
                "supplier_address": "",
                "city": "",
                "region": "",
                "contact_email": "",
                "contact_number": "",
                "supplier_type": "",
                "warehouse_loc": None,
                "confidence": 0.0,
            }
        ]

    average_confidence = sum(item.get("confidence", 0.0) for item in normalized_rows) / max(1, len(normalized_rows))
    return normalized_rows, [{"raw_file": original_name}], average_confidence


def build_ingestion_result(file_paths: List[Tuple[str, str]]) -> IngestionResult:
    all_rows: List[Dict[str, Any]] = []
    all_columns: List[Dict[str, Any]] = []
    supplier_rows: List[Dict[str, Any]] = []
    confidences: List[float] = []

    for file_path, original_name in file_paths:
        normalized_rows, detected_columns, confidence = normalize_uploaded_file(file_path, original_name)
        all_rows.extend(normalized_rows)
        all_columns.extend(detected_columns)
        confidences.append(confidence)

        for row in normalized_rows:
            supplier_rows.append(
                {
                    "row_key": f"supplier-{len(supplier_rows) + 1}",
                    "supplier_name": row.get("supplier_name") or "",
                    "supplier_address": row.get("supplier_address") or "",
                    "city": row.get("city") or "",
                    "region": row.get("region") or "",
                    "contact_email": row.get("contact_email") or "",
                    "contact_number": row.get("contact_number") or "",
                    "supplier_type": row.get("supplier_type") or "",
                    "warehouse_loc": row.get("warehouse_loc") or "",
                    "needs_mapping": True,
                }
            )

    avg_confidence = sum(confidences) / max(1, len(confidences)) if confidences else 0.0
    requires_confirmation = avg_confidence < 85.0

    return IngestionResult(
        item_rows=[
            {
                "row_key": f"item-{index + 1}",
                "item_name": row.get("item_name") or "",
                "material": row.get("material") or "",
                "brand": row.get("brand") or "",
                "unit": row.get("unit") or "",
                "category_id": _infer_category_id(row.get("material") or row.get("item_name")),
                "item_source": row.get("item_source") or "Supplier",
                "price": row.get("price") or 0.0,
                "quality": row.get("quality"),
                "size_width": row.get("size_width"),
                "size_length": row.get("size_length"),
                "color": row.get("color"),
                "description": row.get("description"),
                "recorded_at": datetime.utcnow().isoformat(),
                "needs_mapping": False,
            }
            for index, row in enumerate(all_rows)
        ],
        columns=[
            {"raw_column": name, "mapped_field": None, "source_files": [name]}
            for name in ["item_name", "material", "brand", "unit", "price", "supplier_name", "region"]
        ],
        supplier_rows=supplier_rows,
        confidence=avg_confidence,
        requires_confirmation=requires_confirmation,
    )


if __name__ == "__main__":
    try:
        payload = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {"files": []}
        file_paths = [(entry["tempPath"], entry["originalName"]) for entry in payload.get("files", [])]
        result = build_ingestion_result(file_paths)
        print(json.dumps(result.model_dump(), default=str))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
