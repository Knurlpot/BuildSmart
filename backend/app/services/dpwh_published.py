import os
import tempfile
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.ingest.scraper import download_file, fetch_dpwh_cmpd_links
from app.models import Category, HistoricalPriceRecord, Items
from app.services.candidates import get_item_candidates
from app.services.pricelist_parser import parse_pricelist_file


DPWH_PUBLISHED_BASE_URL = os.environ.get(
    "DPWH_PUBLISHED_BASE_URL",
    "https://www.dpwh.gov.ph/dpwh/bureaus-and-services/bureau-construction",
)


def fetch_dpwh_cmpd_release(region: str) -> list[dict[str, Any]]:
    if not DPWH_PUBLISHED_BASE_URL:
        raise RuntimeError("DPWH_PUBLISHED_BASE_URL is not configured")

    links = fetch_dpwh_cmpd_links(DPWH_PUBLISHED_BASE_URL)
    if not links:
        raise RuntimeError("No DPWH CMPD file links were found on the configured DPWH page")

    latest_url = links[0]
    with tempfile.TemporaryDirectory() as workdir:
        dest = Path(workdir) / Path(latest_url).name
        download_file(latest_url, dest)
        df = parse_pricelist_file(str(dest))

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        item_name = str(
            row.get("raw_name")
            or row.get("item_name")
            or row.get("description")
            or row.get("material")
            or ""
        ).strip()
        raw_unit = str(
            row.get("raw_unit")
            or row.get("unit")
            or row.get("uom")
            or ""
        ).strip()
        raw_price = row.get("raw_price") if "raw_price" in row else row.get("price")
        quarter = row.get("quarter") or row.get("period")
        year = row.get("year")

        if not item_name:
            continue

        rows.append(
            {
                "item_name": item_name,
                "unit": raw_unit,
                "price": raw_price,
                "region": region,
                "quarter": quarter,
                "year": int(year) if year is not None else None,
            }
        )

    if not rows:
        raise RuntimeError("DPWH CMPD file was downloaded but no valid rows could be parsed")

    return rows


def _normalize_dpwh_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if rows := payload.get("rows"):
        return rows
    if data := payload.get("data"):
        return data
    return []


def save_dpwh_cmpd_publish_records(session: Session, payload: dict[str, Any]) -> int:
    # This is a conservative placeholder implementation.
    # It assumes `payload` contains row records with item data and price details.
    processed = 0
    rows = _normalize_dpwh_rows(payload)

    candidates = get_item_candidates(session)
    default_category = session.query(Category).filter_by(category_type="Others").first()
    if default_category is None:
        default_category = session.query(Category).first()
        if default_category is None:
            raise RuntimeError("No category available to assign DPWH items")

    for row in rows:
        raw_name = (row.get("raw_name") or row.get("item_name") or "").strip()
        raw_unit = (row.get("unit") or row.get("raw_unit") or "").strip()
        raw_price = row.get("price")
        region = row.get("region")
        quarter = row.get("quarter")
        year = row.get("year")

        item = None
        if raw_name and raw_unit:
            for candidate in candidates:
                if (
                    candidate["item_name"].strip().lower() == raw_name.lower()
                    and candidate["unit"].strip().lower() == raw_unit.lower()
                ):
                    item = candidate
                    break

        if item is None:
            item_obj = Items(
                category_id=default_category.category_id,
                company_id=None,
                item_name=raw_name or "Unknown DPWH Item",
                material="",
                brand="",
                unit=raw_unit or "",
                item_source="DPWH",
            )
            session.add(item_obj)
            session.flush()
            item_code = item_obj.item_code
        else:
            item_code = item["item_code"]

        record = HistoricalPriceRecord(
            item_code=item_code,
            supplier_id=None,
            price_source="DPWH",
            region=region,
            quarter=quarter,
            year=year,
            price=float(raw_price) if raw_price is not None else 0.0,
        )
        session.add(record)
        processed += 1

    session.commit()
    return processed
