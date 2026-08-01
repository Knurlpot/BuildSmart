from pathlib import Path
from datetime import date

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Category, HistoricalPriceRecord, Items, PriceListReviewItem, PriceListUpload
from app.services.candidates import get_item_candidates
from app.services.match_cache import get_cache_lookup
from app.services.normalize_batch import normalize_pricelist
from app.services.pricelist_parser import MissingColumnsError, parse_pricelist_file
from app.services.normalizer import determine_category
import re

CONFIDENCE_THRESHOLD = 0.85


def _prepare_fast_session(session: Session) -> None:
    # A local dev transaction can otherwise leave Celery waiting forever on a
    # row/table lock. Fail the task with a real API-visible error instead of
    # letting the UI spin for minutes.
    session.execute(text("SET LOCAL lock_timeout = '1500ms'"))
    session.execute(text("SET LOCAL statement_timeout = '30000ms'"))


def _get_or_create_category(session: Session, category_type: str) -> Category:
    category = session.execute(
        select(Category)
        .where(Category.category_type == category_type)
        .order_by(Category.category_id)
    ).scalars().first()
    if category is not None:
        return category

    fallback = session.execute(
        select(Category)
        .where(Category.category_type == "Others")
        .order_by(Category.category_id)
    ).scalars().first()
    if fallback is not None:
        return fallback

    fallback = Category(category_type="Others", category_desc="Others materials")
    session.add(fallback)
    session.flush()
    return fallback


def _get_scoped_item_candidates(session: Session, company_id: int | None) -> list[dict]:
    try:
        return get_item_candidates(session, company_id=company_id)
    except TypeError:
        # Some focused tests monkeypatch get_item_candidates with the old
        # one-argument shape. Production uses the company-scoped signature.
        return get_item_candidates(session)


def _review_description_from_row(row, df, match) -> str:
    row_description = (getattr(row, "description", None) or "").strip()
    if row_description:
        return row_description

    candidate = ""
    for col in df.columns:
        if col in ("raw_name", "raw_unit", "raw_price", "description", "raw_brand"):
            continue
        header = str(col).lower()
        if any(tok in header for tok in ("category", "category_type", "category_desc")):
            continue
        if any(tok in header for tok in ("spec", "desc", "description", "particular")):
            val = getattr(row, col, None)
            if val and str(val).strip():
                candidate = str(val).strip()
                break

    if not candidate:
        longest = ""
        for col in df.columns:
            if col in ("raw_name", "raw_unit", "raw_price", "description", "raw_brand"):
                continue
            header = str(col).lower()
            if any(tok in header for tok in ("category", "category_type", "category_desc")):
                continue
            val = getattr(row, col, None)
            text = str(val).strip() if val is not None else ""
            if text and len(text) > len(longest) and not re.search(r"^\s*\d+[\d,\.\s]*$", text):
                longest = text
        candidate = longest

    return (candidate or (match.brand or "")).strip() or "Generic"


def _add_review_item_for_row(
    session: Session,
    *,
    row,
    df,
    match,
    company_id: int | None,
    upload_id: int | None,
    source: str,
    supplier_id: int | None,
    row_color: str | None,
) -> None:
    review_name = (getattr(row, "raw_name", None) or "").strip() or (match.material or "").strip()
    session.add(
        PriceListReviewItem(
            raw_name=review_name,
            raw_unit=row.raw_unit,
            raw_price=float(row.raw_price),
            confidence=match.confidence,
            suggested_category_type=match.category_type or determine_category(review_name or ""),
            suggested_material=match.material,
            suggested_brand=match.brand,
            description=_review_description_from_row(row, df, match),
            color=row_color,
            company_id=company_id,
            upload_id=upload_id,
            source=source,
            supplier_id=supplier_id,
        )
    )


@celery_app.task
def normalize_price_list(
    file_path: str,
    source: str,
    supplier_id: int | None = None,
    column_mapping: dict[str, str] | None = None,
    company_id: int | None = None,
    upload_id: int | None = None,
    quarter: str | None = None,
    year: int | None = None,
    effective_date: str | None = None,
    force_review: bool = False,
    db: Session | None = None,
) -> dict:
    # `db` lets tests inject a session bound to their own rollback-wrapped
    # transaction (see conftest.py's db_session fixture). A real Celery worker
    # never passes it — `db` isn't serializable through the broker — so it
    # falls back to a fresh SessionLocal() it owns and closes itself.
    owns_session = db is None
    session = db if db is not None else SessionLocal()

    try:
        _prepare_fast_session(session)
        # If uploader didn't indicate a source, treat it as a Supplier upload
        source = (source or "").strip() or "Supplier"
        price_effective_date = date.fromisoformat(effective_date) if effective_date else date.today()
        if upload_id is not None:
            upload = session.get(PriceListUpload, upload_id)
            if upload is not None:
                price_effective_date = upload.effective_date or price_effective_date
                upload.processing_status = "processing"
                upload.error_message = None
                session.flush()
        df = parse_pricelist_file(file_path, column_mapping=column_mapping)
        candidates = _get_scoped_item_candidates(session, company_id)
        cache_lookup = {} if force_review else get_cache_lookup(session, company_id=company_id)
        results = normalize_pricelist(df, candidates, cache_lookup=cache_lookup)

        matched = 0
        new_items_created = 0
        needs_review = 0

        for row, match in zip(df.itertuples(), results):
            row_color = (getattr(row, "color", None) or "").strip() or None
            row_description = (getattr(row, "description", None) or "").strip() or None
            if upload_id is not None:
                _add_review_item_for_row(
                    session,
                    row=row,
                    df=df,
                    match=match,
                    company_id=company_id,
                    upload_id=upload_id,
                    source=source,
                    supplier_id=supplier_id,
                    row_color=row_color,
                )
                needs_review += 1
                continue

            # Direct, non-upload task calls retain the old behavior: low-confidence
            # rows go to review, high-confidence rows are persisted immediately.
            if force_review or match.confidence <= CONFIDENCE_THRESHOLD:
                _add_review_item_for_row(
                    session,
                    row=row,
                    df=df,
                    match=match,
                    company_id=company_id,
                    upload_id=upload_id,
                    source=source,
                    supplier_id=supplier_id,
                    row_color=row_color,
                )
                needs_review += 1
                continue

            item_code = match.matched_item_code

            if match.is_new_item:
                category_type_to_use = match.category_type or determine_category(getattr(row, "raw_name", "") or (match.material or ""))
                category = _get_or_create_category(session, category_type_to_use)
                new_item = Items(
                    category_id=category.category_id,
                    company_id=company_id,
                    item_name=match.item_name,
                    brand=match.brand,
                    unit=match.unit,
                    color=row_color,
                    item_source=source,
                    description=row_description or match.material,
                )
                session.add(new_item)
                session.flush()
                item_code = new_item.item_code
                new_items_created += 1
            elif item_code is not None and (row_color or row_description or company_id is not None):
                existing_item = session.get(Items, item_code)
                if existing_item is not None:
                    if row_color and not existing_item.color:
                        existing_item.color = row_color
                    if row_description:
                        existing_item.description = row_description
                    if company_id is not None and existing_item.company_id is None and source == "Supplier":
                        existing_item.company_id = company_id

            session.add(
                HistoricalPriceRecord(
                    item_code=item_code,
                    supplier_id=supplier_id,
                    price_source=source,
                    effective_date=price_effective_date,
                    quarter=quarter,
                    year=year,
                    price=float(row.raw_price),
                )
            )
            matched += 1

        if upload_id is not None:
            upload = session.get(PriceListUpload, upload_id)
            if upload is not None:
                upload.processing_status = "completed" if needs_review == 0 else "processing"
                upload.records_imported = matched
                upload.error_message = None

        session.commit()
        if upload_id is not None:
            Path(file_path).unlink(missing_ok=True)

        return {
            "processed": len(df),
            "matched": matched,
            "new_items_created": new_items_created,
            "needs_review": needs_review,
            "upload_id": upload_id,
        }
    except MissingColumnsError as exc:
        session.rollback()
        if upload_id is not None:
            upload = session.get(PriceListUpload, upload_id)
            if upload is not None:
                upload.processing_status = "failed"
                upload.error_message = str(exc)
                session.commit()
        raise ValueError(str(exc)) from exc
    except Exception as exc:
        session.rollback()
        if upload_id is not None:
            upload = session.get(PriceListUpload, upload_id)
            if upload is not None:
                upload.processing_status = "failed"
                upload.error_message = str(exc)
                session.commit()
        raise
    finally:
        if owns_session:
            session.close()
