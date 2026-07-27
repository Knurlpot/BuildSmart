from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Category, HistoricalPriceRecord, Items, PriceListReviewItem
from app.services.candidates import get_item_candidates
from app.services.normalize_batch import normalize_pricelist
from app.services.pricelist_parser import parse_pricelist_file
from app.services.normalizer import _fallback_category
import re

CONFIDENCE_THRESHOLD = 0.85


def _ensure_review_item_description_column(session: Session) -> None:
    if session.bind is None:
        return
    columns = {column["name"] for column in inspect(session.bind).get_columns("pricelist_review_item")}
    if "description" not in columns:
        session.execute(text("ALTER TABLE pricelist_review_item ADD COLUMN description VARCHAR(255)"))


@celery_app.task
def normalize_price_list(
    file_path: str,
    source: str,
    supplier_id: int | None = None,
    use_mock: bool | None = None,
    db: Session | None = None,
) -> dict:
    # `db` lets tests inject a session bound to their own rollback-wrapped
    # transaction (see conftest.py's db_session fixture). A real Celery worker
    # never passes it — `db` isn't serializable through the broker — so it
    # falls back to a fresh SessionLocal() it owns and closes itself.
    owns_session = db is None
    session = db if db is not None else SessionLocal()

    try:
        # If uploader didn't indicate a source, treat it as a Supplier upload
        source = (source or "").strip() or "Supplier"
        df = parse_pricelist_file(file_path)
        _ensure_review_item_description_column(session)
        candidates = get_item_candidates(session)
        results = normalize_pricelist(df, candidates, use_mock=use_mock)

        matched = 0
        new_items_created = 0
        needs_review = 0

        for row, match in zip(df.itertuples(), results):
            # Only records strictly above 85% confidence are auto-persisted.
            if match.confidence <= CONFIDENCE_THRESHOLD:
                review_name = (getattr(row, "raw_name", None) or "").strip() or (match.material or "").strip()
                review_description = (getattr(row, "description", None) or "").strip()
                # If parser didn't map a description column, try to infer one from
                # other columns: prefer columns whose header contains 'spec' or
                # 'desc', otherwise pick the longest non-empty textual column.
                if not review_description:
                    candidate = ""
                    # Prefer header-named columns
                    for col in df.columns:
                        if col in ("raw_name", "raw_unit", "raw_price", "description", "raw_brand"):
                            continue
                        header = str(col).lower()
                        # Skip category-like columns
                        if any(tok in header for tok in ("category", "category_type", "category_desc")):
                            continue
                        if any(tok in header for tok in ("spec", "desc", "description", "particular")):
                            val = getattr(row, col, None)
                            if val and str(val).strip():
                                candidate = str(val).strip()
                                break

                    # If none found, pick the longest non-empty text-like cell
                    if not candidate:
                        longest = ""
                        for col in df.columns:
                            if col in ("raw_name", "raw_unit", "raw_price", "description", "raw_brand"):
                                continue
                            header = str(col).lower()
                            # Skip category-like columns
                            if any(tok in header for tok in ("category", "category_type", "category_desc")):
                                continue
                            val = getattr(row, col, None)
                            text = str(val).strip() if val is not None else ""
                            if text and len(text) > len(longest) and not re.search(r"^\s*\d+[\d,\.\s]*$", text):
                                longest = text
                        candidate = longest

                    review_description = (candidate or (match.brand or "")).strip() or "Generic"
                session.add(
                    PriceListReviewItem(
                        raw_name=review_name,
                        raw_unit=row.raw_unit,
                        raw_price=float(row.raw_price),
                        confidence=match.confidence,
                        suggested_category_type=match.category_type or _fallback_category(review_name or ""),
                        suggested_material=match.material,
                        suggested_brand=match.brand,
                        description=review_description,
                        source=source,
                        supplier_id=supplier_id,
                    )
                )
                needs_review += 1
                continue

            item_code = match.matched_item_code

            if match.is_new_item:
                # Use match.category_type when present, otherwise infer from raw name
                category_type_to_use = match.category_type or _fallback_category(getattr(row, "raw_name", "") or (match.material or ""))
                category = session.execute(
                    select(Category).where(Category.category_type == category_type_to_use)
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
