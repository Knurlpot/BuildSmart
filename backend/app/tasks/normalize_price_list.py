from pathlib import Path
from datetime import date, datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Category, HistoricalPriceRecord, Items, PriceListReviewItem, PriceListUpload
from app.services.candidates import get_item_candidates
from app.services.match_cache import get_cache_lookup
from app.services.normalize_batch import normalize_pricelist
from app.services.philippine_regions import infer_region_from_location
from app.services.pricelist_parser import MissingColumnsError, expand_dpwh_deo_price_columns, parse_pricelist_file
from app.services.normalizer import determine_category

CONFIDENCE_THRESHOLD = 0.85


def _fit(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


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


def _optional_text(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _review_description_from_row(row) -> str:
    return _fit(_optional_text(getattr(row, "description", None)), 255) or ""


def _optional_price(value) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _find_existing_supplier_price(
    session: Session,
    *,
    item_code: int,
    supplier_id: int | None,
    source: str,
    region: str | None,
    location: str | None,
    effective_date: date,
) -> HistoricalPriceRecord | None:
    if source != "Supplier":
        return None

    statement = (
        select(HistoricalPriceRecord)
        .where(HistoricalPriceRecord.item_code == item_code)
        .where(HistoricalPriceRecord.price_source == source)
        .where(HistoricalPriceRecord.region == region if region is not None else HistoricalPriceRecord.region.is_(None))
        .where(HistoricalPriceRecord.location == location if location is not None else HistoricalPriceRecord.location.is_(None))
        .where(HistoricalPriceRecord.effective_date == effective_date)
        .order_by(HistoricalPriceRecord.effective_date.desc(), HistoricalPriceRecord.recorded_at.desc(), HistoricalPriceRecord.historicalrec_id.desc())
    )
    if supplier_id is None:
        statement = statement.where(HistoricalPriceRecord.supplier_id.is_(None))
    else:
        statement = statement.where(HistoricalPriceRecord.supplier_id == supplier_id)
    return session.execute(statement).scalars().first()


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
    row_region: str | None = None,
    row_location: str | None = None,
) -> None:
    review_name = _fit((getattr(row, "raw_name", None) or "").strip() or (match.material or "").strip(), 255) or "Unknown material"
    session.add(
        PriceListReviewItem(
            raw_name=review_name,
            raw_unit=_fit(row.raw_unit, 30) or "unit",
            raw_price=_optional_price(row.raw_price),
            confidence=match.confidence,
            suggested_category_type=match.category_type or determine_category(review_name or ""),
            suggested_material=_fit(match.material, 255),
            suggested_brand=_fit(getattr(row, "raw_brand", None), 100) or "Generic",
            description=_review_description_from_row(row),
            color=_fit(row_color, 50),
            region=_fit(row_region, 255),
            location=_fit(row_location, 255),
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
        if source == "DPWH":
            df = expand_dpwh_deo_price_columns(df, default_region="NIR")
        candidates = _get_scoped_item_candidates(session, company_id)
        cache_lookup = {} if force_review else get_cache_lookup(session, company_id=company_id)
        results = normalize_pricelist(df, candidates, cache_lookup=cache_lookup)

        matched = 0
        new_items_created = 0
        needs_review = 0

        for row, match in zip(df.itertuples(), results):
            row_price = _optional_price(getattr(row, "raw_price", None))
            row_color = (getattr(row, "color", None) or "").strip() or None
            row_description = (getattr(row, "description", None) or "").strip() or None
            row_location = (getattr(row, "location", None) or "").strip() or None
            row_region = (getattr(row, "region", None) or "").strip() or None
            if row_region is None:
                row_region = infer_region_from_location(row_location)
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
                    row_region=row_region,
                    row_location=row_location if source == "DPWH" else None,
                )
                needs_review += 1
                continue

            # Direct, non-upload task calls retain the old behavior: low-confidence
            # rows go to review, high-confidence rows are persisted immediately.
            if force_review or row_price is None or match.confidence <= CONFIDENCE_THRESHOLD:
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
                    row_region=row_region,
                    row_location=row_location if source == "DPWH" else None,
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
                    item_name=_fit(match.item_name, 255) or "Unknown material",
                    brand=_fit(match.brand, 100) or "Generic",
                    unit=_fit(match.unit, 30) or "unit",
                    color=row_color,
                    item_source=source,
                    source_location=None,
                    description=row_description,
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

            price_region = row_region or (row_location if source == "DPWH" and row_location in {
                "Region I", "Region II", "Region III", "Region IV-A", "Region IV-B",
                "Region V", "Region VI", "Region VII", "Region VIII", "Region IX",
                "Region X", "Region XI", "Region XII", "Region XIII", "CAR", "NCR",
                "NIR", "BARMM",
            } else None)
            price_location = row_location if source == "DPWH" else None
            existing_price = _find_existing_supplier_price(
                session,
                item_code=item_code,
                supplier_id=supplier_id,
                source=source,
                region=price_region,
                location=price_location,
                effective_date=price_effective_date,
            )

            if existing_price is None:
                session.add(
                    HistoricalPriceRecord(
                        item_code=item_code,
                        supplier_id=supplier_id,
                        price_source=source,
                        region=price_region,
                        location=price_location,
                        effective_date=price_effective_date,
                        quarter=quarter,
                        year=year,
                        price=row_price,
                    )
                )
            else:
                existing_price.price = row_price
                existing_price.effective_date = price_effective_date
                existing_price.quarter = quarter
                existing_price.year = year
                existing_price.recorded_at = datetime.now()
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
