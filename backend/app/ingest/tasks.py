import os
from pathlib import Path

from celery import shared_task
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.ingest.models import ProcessedFileLog
from app.ingest.schemas import NormalizedItem, ParsedFileOutput, RawItemRow
from app.ingest.scraper import compute_sha256, download_file, fetch_dpwh_cmpd_links, fetch_psa_dataset_links, parse_dpwh_pdf_text, parse_psa_table
from app.ingest.normalizer import normalize_row
from app.models import HistoricalPriceRecord, Items as Item


DPWH_BASE_URL = os.environ.get("DPWH_PUBLISHED_BASE_URL", "https://www.dpwh.gov.ph/dpwh/majorprojects")
PSA_BASE_URL = os.environ.get("PSA_PUBLISHED_BASE_URL", "https://psa.gov.ph/news")
INGEST_STORAGE_ROOT = Path(os.environ.get("INGEST_STORAGE_ROOT", "/tmp/ingest_files"))
DEFAULT_CATEGORY_ID = int(os.environ.get("INGEST_DEFAULT_CATEGORY_ID", "1"))


def ensure_item(session: Session, normalized: NormalizedItem, source: str) -> Item:
    item_code = None
    if normalized.item_code is not None:
        try:
            item_code = int(normalized.item_code)
        except (ValueError, TypeError):
            item_code = None

    item = None
    if item_code is not None:
        item = session.get(Item, item_code)

    if item is None:
        item_data = {
            "category_id": DEFAULT_CATEGORY_ID,
            "item_name": normalized.standardized_name,
            "material": normalized.raw_material_name,
            "brand": normalized.specifications.get("brand_or_type") or "unknown",
            "quality": normalized.specifications.get("grade"),
            "unit": normalized.unit,
            "size_width": None,
            "size_length": None,
            "color": None,
            "item_source": source,
            "description": None,
        }
        if item_code is not None:
            item_data["item_code"] = item_code

        item = Item(**item_data)
        session.add(item)
        session.flush()

    return item


def save_historical_prices(session: Session, normalized_items: list[NormalizedItem], source: str) -> int:
    inserted = 0
    for normalized in normalized_items:
        item = ensure_item(session, normalized, source)
        price = HistoricalPriceRecord(
            item_code=item.item_code,
            supplier_id=None,
            price_source=source,
            region=normalized.specifications.get("region") or "Unknown",
            quarter=normalized.specifications.get("quarter") or "Unknown",
            year=normalized.specifications.get("year") or 0,
            price=normalized.unit_cost,
        )
        session.add(price)
        inserted += 1
    return inserted


@shared_task(bind=True)
def ingest_dpwh_cmpd(self, release_id: str | None = None) -> dict[str, int | str]:
    source = "DPWH"
    output: dict[str, int | str] = {"release_id": release_id or "latest", "records": 0, "status": "failed"}

    with get_db_session() as session:
        try:
            links = fetch_dpwh_cmpd_links(DPWH_BASE_URL)
            if not links:
                raise ValueError("Unable to discover DPWH dataset links")

            downloaded = []
            for href in links:
                target_url = href if href.startswith("http") else f"{DPWH_BASE_URL.rstrip('/')}/{href.lstrip('/')}"
                file_name = os.path.basename(target_url)
                dest = INGEST_STORAGE_ROOT / source / file_name
                _, file_hash = download_file(target_url, dest)
                downloaded.append((dest, target_url, file_hash))

            for dest, target_url, file_hash in downloaded:
                log = ProcessedFileLog(
                    source_type=source,
                    file_name=dest.name,
                    file_url=target_url,
                    storage_path=str(dest),
                    file_hash=file_hash,
                    quarter="Q1",
                    year=1,
                    records_processed=0,
                    status="downloaded",
                )
                session.add(log)
            session.commit()
            output["status"] = "downloaded"
            output["records"] = len(downloaded)
        except Exception as exc:
            session.rollback()
            output["status"] = "error"
            output["error"] = str(exc)
    return output


@shared_task(bind=True)
def ingest_psa_dataset(self, dataset_id: str | None = None) -> dict[str, int | str]:
    source = "PSA"
    output: dict[str, int | str] = {"dataset_id": dataset_id or "latest", "records": 0, "status": "failed"}

    with get_db_session() as session:
        try:
            links = fetch_psa_dataset_links(PSA_BASE_URL)
            if not links:
                raise ValueError("Unable to discover PSA dataset links")

            downloaded = []
            for href in links:
                target_url = href if href.startswith("http") else f"{PSA_BASE_URL.rstrip('/')}/{href.lstrip('/')}"
                file_name = os.path.basename(target_url)
                dest = INGEST_STORAGE_ROOT / source / file_name
                _, file_hash = download_file(target_url, dest)
                downloaded.append((dest, target_url, file_hash))

            for dest, target_url, file_hash in downloaded:
                log = ProcessedFileLog(
                    source_type=source,
                    file_name=dest.name,
                    file_url=target_url,
                    storage_path=str(dest),
                    file_hash=file_hash,
                    quarter="Q1",
                    year=1,
                    records_processed=0,
                    status="downloaded",
                )
                session.add(log)
            session.commit()
            output["status"] = "downloaded"
            output["records"] = len(downloaded)
        except Exception as exc:
            session.rollback()
            output["status"] = "error"
            output["error"] = str(exc)
    return output


@shared_task(bind=True)
def normalize_ingested_file(self, file_id: int) -> dict[str, int | str]:
    output: dict[str, int | str] = {"file_id": file_id, "records": 0, "status": "failed"}

    with get_db_session() as session:
        log = session.get(ProcessedFileLog, file_id)
        if log is None:
            return {"file_id": file_id, "status": "missing"}

        try:
            # Placeholder parse stage; real parser should inspect file extension and content.
            parsed_rows: list[RawItemRow] = []
            if log.file_name.lower().endswith(".csv"):
                import pandas as pd

                df = pd.read_csv(log.storage_path)
                parsed_rows = parse_psa_table(df, log.source_type, log.quarter, log.year)
            elif log.file_name.lower().endswith(".xlsx"):
                import pandas as pd

                df = pd.read_excel(log.storage_path)
                parsed_rows = parse_psa_table(df, log.source_type, log.quarter, log.year)
            else:
                raise ValueError("Unsupported file type for normalization")

            normalized_items: list[NormalizedItem] = []
            for row in parsed_rows:
                normalized = normalize_row(row.model_dump(), [])
                normalized_items.append(normalized)

            records_count = save_historical_prices(session, normalized_items, log.source_type)
            log.records_processed = records_count
            log.status = "normalized"
            session.commit()
            output["records"] = records_count
            output["status"] = "normalized"
        except Exception as exc:
            session.rollback()
            log.status = "error"
            log.error_log = str(exc)
            session.commit()
            output["status"] = "error"
            output["error"] = str(exc)
    return output
