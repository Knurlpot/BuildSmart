import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import MaterialPrice
from app.services.pdf_extractor import HybridPDFExtractor

logger = logging.getLogger(__name__)

DEFAULT_SOURCE_URL = "https://www.dpwh.gov.ph/dpwh/bureaus-and-services/bureau-construction"


@shared_task(name="app.tasks.government_price_ingestion.ingest_government_prices_task")
def ingest_government_prices_task(pdf_url: str, source_name: str, quarter: str) -> Dict[str, Any]:
    extractor = HybridPDFExtractor()
    temp_path: Optional[Path] = None
    session: Optional[Session] = None

    try:
        temp_path = _download_pdf(pdf_url)
        rows = extractor.extract(str(temp_path), source_name=source_name, quarter=quarter)
        session = SessionLocal()
        inserted = _bulk_upsert_material_prices(session, rows, source_name=source_name, quarter=quarter, source_url=pdf_url)
        session.commit()
        return {
            "status": "ok",
            "rows_processed": len(rows),
            "records_upserted": inserted,
            "source": source_name,
            "quarter": quarter,
        }
    except Exception as exc:  # pragma: no cover - task error path
        logger.exception("Government price ingestion failed for %s", pdf_url)
        if session is not None:
            session.rollback()
        return {
            "status": "error",
            "error": str(exc),
            "source": source_name,
            "quarter": quarter,
        }
    finally:
        if session is not None:
            session.close()
        if temp_path is not None and temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                logger.debug("Failed to remove temporary file %s", temp_path)


def _download_pdf(pdf_url: str) -> Path:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/pdf,application/octet-stream,text/plain,*/*",
    }
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        response = client.get(pdf_url, headers=headers)
        response.raise_for_status()

    suffix = Path(pdf_url).suffix or ".pdf"
    temp_dir = Path(tempfile.gettempdir()) / "buildsmart_ingest"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{suffix}"
    temp_path.write_bytes(response.content)
    return temp_path


def _bulk_upsert_material_prices(session: Session, rows: List[Dict[str, Any]], source_name: str, quarter: str, source_url: str) -> int:
    if not rows:
        return 0

    inserted = 0
    for row in rows:
        material_name = str(row.get("material_name", "")).strip()
        unit = str(row.get("unit", "")).strip()
        unit_cost = row.get("unit_cost")
        if not material_name or unit_cost is None:
            continue
        normalized_cost = float(unit_cost)

        existing = session.execute(
            select(MaterialPrice).where(
                MaterialPrice.material_name == material_name,
                MaterialPrice.unit == unit,
                MaterialPrice.source == source_name,
                MaterialPrice.effective_quarter == quarter,
            )
        ).scalar_one_or_none()

        if existing is None:
            material_price = MaterialPrice(
                item_code=None,
                material_name=material_name,
                unit=unit,
                unit_cost=normalized_cost,
                source=source_name,
                source_url=source_url or DEFAULT_SOURCE_URL,
                effective_quarter=quarter,
            )
            session.add(material_price)
            inserted += 1
        else:
            existing.unit_cost = normalized_cost
            existing.source_url = source_url or DEFAULT_SOURCE_URL
            existing.created_at = datetime.utcnow()

    return inserted
