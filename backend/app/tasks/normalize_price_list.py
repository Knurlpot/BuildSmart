from sqlalchemy import select
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Category, HistoricalPriceRecord, Items, PriceListReviewItem
from app.services.candidates import get_item_candidates
from app.services.normalize_batch import normalize_pricelist
from app.services.pricelist_parser import parse_pricelist_file

CONFIDENCE_THRESHOLD = 0.6


@celery_app.task
def normalize_price_list(
    file_path: str,
    source: str,
    supplier_id: int | None = None,
    db: Session | None = None,
) -> dict:
    # `db` lets tests inject a session bound to their own rollback-wrapped
    # transaction (see conftest.py's db_session fixture). A real Celery worker
    # never passes it — `db` isn't serializable through the broker — so it
    # falls back to a fresh SessionLocal() it owns and closes itself.
    owns_session = db is None
    session = db if db is not None else SessionLocal()

    try:
        df = parse_pricelist_file(file_path)
        candidates = get_item_candidates(session)
        results = normalize_pricelist(df, candidates)

        matched = 0
        new_items_created = 0
        needs_review = 0

        for row, match in zip(df.itertuples(), results):
            if match.confidence < CONFIDENCE_THRESHOLD:
                session.add(
                    PriceListReviewItem(
                        raw_name=row.raw_name,
                        raw_unit=row.raw_unit,
                        raw_price=float(row.raw_price),
                        confidence=match.confidence,
                        suggested_category_type=match.category_type,
                        suggested_material=match.material,
                        suggested_brand=match.brand,
                        source=source,
                        supplier_id=supplier_id,
                    )
                )
                needs_review += 1
                continue

            item_code = match.matched_item_code

            if match.is_new_item:
                category = session.execute(
                    select(Category).where(Category.category_type == match.category_type)
                ).scalar_one()
                new_item = Items(
                    category_id=category.category_id,
                    item_name=match.item_name,
                    material=match.material,
                    brand=match.brand,
                    unit=match.unit,
                    item_source=source,
                )
                session.add(new_item)
                session.flush()
                item_code = new_item.item_code
                new_items_created += 1

            session.add(
                HistoricalPriceRecord(
                    item_code=item_code,
                    supplier_id=supplier_id,
                    price_source=source,
                    price=float(row.raw_price),
                )
            )
            matched += 1

        session.commit()

        return {
            "processed": len(df),
            "matched": matched,
            "new_items_created": new_items_created,
            "needs_review": needs_review,
        }
    finally:
        if owns_session:
            session.close()
