import logging
import os
import re
import tempfile
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)


class HybridPDFExtractor:
    """Extract tabular price data from PDFs using a layered fallback strategy."""

    def __init__(self) -> None:
        self.logger = logger

    def extract(self, file_path: str, source_name: str = "UNKNOWN", quarter: Optional[str] = None) -> List[Dict[str, Any]]:
        temp_path = os.path.abspath(file_path)
        if not os.path.exists(temp_path):
            raise FileNotFoundError(f"PDF file not found: {temp_path}")

        try:
            df = self._extract_with_camelot(temp_path)
            if self._is_valid_dataframe(df):
                self.logger.info("PDF extraction succeeded using camelot lattice stage for %s", source_name)
                return self._dataframe_to_rows(df, source_name=source_name, quarter=quarter)

            df = self._extract_with_pdfplumber(temp_path)
            if self._is_valid_dataframe(df):
                self.logger.info("PDF extraction succeeded using pdfplumber stage for %s", source_name)
                return self._dataframe_to_rows(df, source_name=source_name, quarter=quarter)

            rows = self._extract_with_ocr(temp_path)
            if rows:
                self.logger.info("PDF extraction succeeded using OCR fallback stage for %s", source_name)
                return self._normalize_rows(rows, source_name=source_name, quarter=quarter)

            self.logger.warning("No tabular rows extracted from %s", source_name)
            return []
        except Exception as exc:  # pragma: no cover - defensive logging path
            self.logger.exception("PDF extraction failed for %s: %s", source_name, exc)
            return []

    def _extract_with_camelot(self, file_path: str) -> Optional[pd.DataFrame]:
        try:
            import camelot
        except ImportError as exc:  # pragma: no cover - optional dependency guard
            self.logger.debug("camelot is not available: %s", exc)
            return None

        try:
            tables = camelot.read_pdf(file_path, flavor="lattice")
        except Exception as exc:  # pragma: no cover - parser-specific failures
            self.logger.debug("Camelot lattice extraction failed: %s", exc)
            return None

        if not tables:
            return None

        frames: List[pd.DataFrame] = []
        for table in tables:
            try:
                frame = table.df
            except Exception:  # pragma: no cover - defensive fallback
                continue
            if frame is not None and not frame.empty:
                frames.append(frame)

        if not frames:
            return None

        combined = pd.concat(frames, ignore_index=True)
        return combined

    def _extract_with_pdfplumber(self, file_path: str) -> Optional[pd.DataFrame]:
        try:
            import pdfplumber
        except ImportError as exc:  # pragma: no cover - optional dependency guard
            self.logger.debug("pdfplumber is not available: %s", exc)
            return None

        try:
            with pdfplumber.open(file_path) as pdf:
                frames: List[pd.DataFrame] = []
                for page in pdf.pages:
                    try:
                        tables = page.extract_tables() or []
                    except Exception as exc:  # pragma: no cover - parser-specific failures
                        self.logger.debug("pdfplumber page extraction failed: %s", exc)
                        continue
                    for table in tables:
                        if not table:
                            continue
                        columns = [str(col).strip() for col in table[0]]
                        rows = table[1:]
                        if rows:
                            frame = pd.DataFrame(rows, columns=columns)
                            frames.append(frame)
                if not frames:
                    return None
                return pd.concat(frames, ignore_index=True)
        except Exception as exc:  # pragma: no cover - parser-specific failures
            self.logger.debug("pdfplumber extraction failed: %s", exc)
            return None

    def _extract_with_ocr(self, file_path: str) -> List[Dict[str, Any]]:
        try:
            from pdf2image import convert_from_path
            import pytesseract
        except ImportError as exc:  # pragma: no cover - optional dependency guard
            self.logger.debug("OCR dependencies are not available: %s", exc)
            return []

        try:
            images = convert_from_path(file_path, dpi=300)
        except Exception as exc:  # pragma: no cover - image conversion failure
            self.logger.debug("PDF to image conversion failed: %s", exc)
            return []

        if not images:
            return []

        ocr_text_parts: List[str] = []
        for image in images:
            try:
                ocr_text_parts.append(pytesseract.image_to_string(image))
            except Exception as exc:  # pragma: no cover - OCR runtime failure
                self.logger.debug("OCR extraction failed on one page: %s", exc)

        combined_text = "\n".join(ocr_text_parts)
        return self.parse_ocr_text(combined_text)

    def parse_ocr_text(self, ocr_text: str) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for raw_line in ocr_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.lower().startswith(("item description", "unit of measurement", "unit cost", "description", "material")):
                continue

            if re.search(r"\d", line):
                parts = [part.strip() for part in re.split(r"\s{2,}", line) if part.strip()]
                if len(parts) >= 3:
                    material_name = parts[0]
                    unit = parts[1]
                    cost_text = parts[-1]
                else:
                    match = re.match(r"^(?P<name>.+?)\s+(?P<unit>\S+)\s+(?P<cost>[\d,\.\-]+)$", line)
                    if not match:
                        continue
                    material_name = match.group("name")
                    unit = match.group("unit")
                    cost_text = match.group("cost")
                try:
                    unit_cost = self._sanitize_numeric_value(cost_text)
                except ValueError:
                    continue
                rows.append({
                    "material_name": self._sanitize_text(material_name),
                    "unit": self._sanitize_text(unit),
                    "unit_cost": unit_cost,
                })

        return rows

    def _dataframe_to_rows(self, df: pd.DataFrame, source_name: str, quarter: Optional[str]) -> List[Dict[str, Any]]:
        if df is None or df.empty:
            return []

        normalized = df.copy()
        normalized.columns = [str(col).strip() for col in normalized.columns]
        candidate_columns = {
            "material_name": ["item description", "material", "description", "item", "item name", "material_name"],
            "unit": ["unit", "unit of measurement", "uom", "measurement", "unit_measurement"],
            "unit_cost": ["unit cost", "price", "cost", "unit_price", "amount", "unit cost (php)", "cost_php"],
        }

        resolved_columns: Dict[str, Optional[str]] = {}
        for target, aliases in candidate_columns.items():
            matching = None
            normalized_names = {str(col).strip().lower(): col for col in normalized.columns}
            for alias in aliases:
                if alias in normalized_names:
                    matching = normalized_names[alias]
                    break
            resolved_columns[target] = matching

        rows: List[Dict[str, Any]] = []
        for _, row in normalized.iterrows():
            material_name = self._extract_column_value(row, resolved_columns["material_name"])
            unit = self._extract_column_value(row, resolved_columns["unit"])
            cost = self._extract_column_value(row, resolved_columns["unit_cost"])
            if not material_name and not unit and not cost:
                continue
            if cost is None:
                continue
            rows.append({
                "material_name": self._sanitize_text(material_name),
                "unit": self._sanitize_text(unit),
                "unit_cost": self._sanitize_numeric_value(cost),
                "source": source_name,
                "quarter": quarter,
            })

        return self._normalize_rows(rows, source_name=source_name, quarter=quarter)

    def _normalize_rows(self, rows: List[Dict[str, Any]], source_name: str, quarter: Optional[str]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for row in rows:
            material_name = self._sanitize_text(row.get("material_name"))
            unit = self._sanitize_text(row.get("unit"))
            cost = self._sanitize_numeric_value(row.get("unit_cost"))
            if not material_name and not unit and cost is None:
                continue
            normalized.append({
                "material_name": material_name or "Unnamed material",
                "unit": unit or "unit",
                "unit_cost": cost if cost is not None else 0.0,
                "source": source_name,
                "quarter": quarter,
            })
        return normalized

    def _extract_column_value(self, row: pd.Series, column_name: Optional[str]) -> Any:
        if column_name is None:
            return None
        return row.get(column_name)

    def _is_valid_dataframe(self, df: Optional[pd.DataFrame]) -> bool:
        if df is None or df.empty:
            return False
        if df.shape[0] <= 1 and df.shape[1] <= 1:
            return False
        non_empty_values = 0
        for value in df.to_numpy().flatten():
            if isinstance(value, str):
                text = value.strip()
                if text and text.lower() not in {"nan", "none", "none"}:
                    non_empty_values += 1
            elif pd.notna(value):
                non_empty_values += 1
        return non_empty_values > 0

    def _sanitize_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, float) and pd.isna(value):
            return ""
        text = str(value).strip()
        text = re.sub(r"\s+", " ", text)
        text = text.replace("\u00a0", " ")
        return text

    def _sanitize_numeric_value(self, value: Any) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            text = text.replace("₱", "").replace("$", "")
            text = text.replace(",", "")
            text = text.replace("(", "-").replace(")", "")
            text = text.strip()
            if text.lower() in {"nan", "none", ""}:
                return None
            try:
                return float(text)
            except ValueError:
                return None
        return None
