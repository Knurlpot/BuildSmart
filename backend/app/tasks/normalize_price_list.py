from pathlib import Path
from datetime import date, datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Category, HistoricalPriceRecord, Items, PriceListReviewItem, PriceListUpload
from app.services.candidates import get_item_candidates
from app.services.file_hash import calculate_file_hash, calculate_file_size
from app.services.match_cache import get_cache_lookup
from app.services.normalize_batch import normalize_pricelist
from app.services.philippine_regions import infer_region_from_location
from app.services.pricelist_ai_review import (
    GEMINI_REVIEW_BATCH_SIZE,
    _cleanup_material_name,
    deterministic_pdf_reviews,
    iter_gemini_pdf_reviews,
    should_review_with_gemini,
)
from app.services.pricelist_parser import MissingColumnsError, expand_dpwh_deo_price_columns, parse_pricelist_file
from app.services.normalizer import determine_category, normalize_material

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


def _review_description_with_ai_note(row, ai_issue: str | None) -> str:
    description = _review_description_from_row(row)
    issue = _fit(ai_issue, 180)
    if not issue:
        return description
    note = f"AI review: {issue}"
    return _fit(f"{description} | {note}" if description else note, 255) or ""


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


def _persist_matched_price(
    session: Session,
    *,
    row,
    match,
    company_id: int | None,
    supplier_id: int | None,
    source: str,
    row_price: float,
    row_color: str | None,
    row_description: str | None,
    row_region: str | None,
    row_location: str | None,
    price_effective_date: date,
    quarter: str | None,
    year: int | None,
) -> bool:
    item_code = match.matched_item_code
    raw_name = getattr(row, "raw_name", "") or (match.material or "")
    item_name = _cleanup_material_name(raw_name) or _cleanup_material_name(getattr(match, "item_name", "")) or match.item_name

    if match.is_new_item:
        category_type_to_use = match.category_type or determine_category(raw_name)
        category = _get_or_create_category(session, category_type_to_use)
        new_item = Items(
            category_id=category.category_id,
            company_id=company_id,
            item_name=_fit(item_name, 255) or "Unknown material",
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
    elif item_code is not None and (row_color or row_description or company_id is not None or source == "DPWH"):
        existing_item = session.get(Items, item_code)
        if existing_item is not None:
            clean_existing_name = _cleanup_material_name(existing_item.item_name)
            if source == "DPWH" and clean_existing_name:
                existing_item.item_name = clean_existing_name
            if row_color and not existing_item.color:
                existing_item.color = row_color
            if row_description:
                existing_item.description = row_description
            if company_id is not None and existing_item.company_id is None and source == "Supplier":
                existing_item.company_id = company_id

    if item_code is None:
        return False

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

    return True


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
    ai_review=None,
) -> PriceListReviewItem:
    ai_name = getattr(ai_review, "raw_name", None) if ai_review is not None else None
    ai_unit = getattr(ai_review, "raw_unit", None) if ai_review is not None else None
    ai_price = getattr(ai_review, "raw_price", None) if ai_review is not None else None
    ai_issue = getattr(ai_review, "issue", None) if ai_review is not None else None
    review_name = _fit((ai_name or getattr(row, "raw_name", None) or "").strip() or (match.material or "").strip(), 255) or "Unknown material"
    item = PriceListReviewItem(
        raw_name=review_name,
        raw_unit=_fit(ai_unit or row.raw_unit, 30) or "unit",
        raw_price=_optional_price(ai_price if ai_price is not None else row.raw_price),
        confidence=match.confidence,
        suggested_category_type=match.category_type or determine_category(review_name or ""),
        suggested_material=_fit(match.material, 255),
        suggested_brand=_fit(getattr(row, "raw_brand", None), 100) or "Generic",
        description=_review_description_with_ai_note(row, ai_issue),
        color=_fit(row_color, 50),
        region=_fit(row_region, 255),
        location=_fit(row_location, 255),
        company_id=company_id,
        upload_id=upload_id,
        source=source,
        supplier_id=supplier_id,
    )
    session.add(item)
    return item


def _apply_ai_review_to_review_item(item: PriceListReviewItem, ai_review) -> None:
    ai_name = getattr(ai_review, "raw_name", None)
    ai_unit = getattr(ai_review, "raw_unit", None)
    ai_price = getattr(ai_review, "raw_price", None)
    ai_issue = getattr(ai_review, "issue", None)
    if ai_name:
        cleaned_ai_name = _cleanup_material_name(str(ai_name)) or str(ai_name).strip()
        item.raw_name = _fit(cleaned_ai_name, 255) or item.raw_name
        item.suggested_category_type = item.suggested_category_type or determine_category(item.raw_name or "")
    if ai_unit:
        item.raw_unit = _fit(str(ai_unit).strip(), 30) or item.raw_unit
    if ai_price is not None:
        item.raw_price = _optional_price(ai_price)
    if ai_issue:
        current = item.description or ""
        note = f"AI review: {_fit(ai_issue, 180)}"
        item.description = _fit(f"{current} | {note}" if current and "AI review:" not in current else current or note, 255)


@celery_app.task(bind=True)
def normalize_price_list(
    self,
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
                if Path(file_path).suffix.lower() == ".pdf":
                    real_file_hash = calculate_file_hash(file_path)
                    upload.file_size = calculate_file_size(file_path)
                    upload.file_hash = real_file_hash
                session.flush()
        df = parse_pricelist_file(file_path, column_mapping=column_mapping)
        if source == "DPWH":
            df = expand_dpwh_deo_price_columns(df, default_region="NIR")
        ai_reviews = deterministic_pdf_reviews(df, file_path)
        if ai_reviews:
            df = df.copy()
            for row_index, ai_review in ai_reviews.items():
                cleaned_name = getattr(ai_review, "raw_name", None)
                if cleaned_name and 0 <= row_index < len(df):
                    df.at[df.index[row_index], "raw_name"] = cleaned_name
        candidates = _get_scoped_item_candidates(session, company_id)
        cache_lookup = {} if force_review else get_cache_lookup(session, company_id=company_id)
        results = normalize_pricelist(df, candidates, cache_lookup=cache_lookup)

        matched = 0
        new_items_created = 0
        needs_review = 0
        review_items_by_row_index: dict[int, PriceListReviewItem] = {}

        for row_index, (row, match) in enumerate(zip(df.itertuples(), results)):
            row_price = _optional_price(getattr(row, "raw_price", None))
            row_color = (getattr(row, "color", None) or "").strip() or None
            row_description = (getattr(row, "description", None) or "").strip() or None
            row_location = (getattr(row, "location", None) or "").strip() or None
            row_region = (getattr(row, "region", None) or "").strip() or None
            if row_region is None:
                row_region = infer_region_from_location(row_location)
            ai_review = ai_reviews.get(row_index)
            effective_confidence = float(match.confidence)

            if force_review or row_price is None or effective_confidence < CONFIDENCE_THRESHOLD:
                review_item = _add_review_item_for_row(
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
                    ai_review=ai_review,
                )
                review_items_by_row_index[row_index] = review_item
                needs_review += 1
                continue

            stored = _persist_matched_price(
                session,
                row=row,
                match=match,
                company_id=company_id,
                supplier_id=supplier_id,
                source=source,
                row_price=row_price,
                row_color=row_color,
                row_description=row_description,
                row_region=row_region,
                row_location=row_location,
                price_effective_date=price_effective_date,
                quarter=quarter,
                year=year,
            )
            if stored:
                matched += 1
                if match.is_new_item:
                    new_items_created += 1

        if upload_id is not None:
            upload = session.get(PriceListUpload, upload_id)
            if upload is not None:
                upload.processing_status = "completed" if needs_review == 0 else "processing"
                upload.records_imported = matched
                upload.error_message = None

        session.commit()

        gemini_reviewed = 0
        if upload_id is not None and should_review_with_gemini(file_path):
            total_rows = len(df)
            self.update_state(
                state="PROGRESS",
                meta={
                    "phase": "gemini_review",
                    "gemini_reviewed": 0,
                    "gemini_total": total_rows,
                    "processed": len(df),
                    "matched": matched,
                    "auto_stored": matched,
                    "new_items_created": new_items_created,
                    "needs_review": needs_review,
                    "upload_id": upload_id,
                },
            )
            for chunk_reviews in iter_gemini_pdf_reviews(df, file_path):
                for row_index, ai_review in chunk_reviews.items():
                    review_item = review_items_by_row_index.get(row_index)
                    if review_item is None:
                        continue
                    _apply_ai_review_to_review_item(review_item, ai_review)
                    row_price = _optional_price(review_item.raw_price)
                    if row_price is None:
                        continue
                    rematch = normalize_material(
                        review_item.raw_name,
                        review_item.raw_unit,
                        candidates,
                        raw_brand=review_item.suggested_brand or "Generic",
                    )
                    review_item.confidence = max(float(review_item.confidence), float(rematch.confidence))
                    if rematch.confidence >= CONFIDENCE_THRESHOLD:
                        stored = _persist_matched_price(
                            session,
                            row=review_item,
                            match=rematch,
                            company_id=company_id,
                            supplier_id=supplier_id,
                            source=source,
                            row_price=row_price,
                            row_color=review_item.color,
                            row_description=review_item.description,
                            row_region=review_item.region,
                            row_location=review_item.location,
                            price_effective_date=price_effective_date,
                            quarter=quarter,
                            year=year,
                        )
                        if stored:
                            review_item.status = "Approved"
                            review_items_by_row_index.pop(row_index, None)
                            matched += 1
                            needs_review = max(0, needs_review - 1)
                            if rematch.is_new_item:
                                new_items_created += 1
                gemini_reviewed = min(total_rows, gemini_reviewed + GEMINI_REVIEW_BATCH_SIZE)
                upload = session.get(PriceListUpload, upload_id)
                if upload is not None:
                    upload.processing_status = "completed" if needs_review == 0 else "processing"
                    upload.records_imported = matched
                session.commit()
                self.update_state(
                    state="PROGRESS",
                    meta={
                        "phase": "gemini_review",
                        "gemini_reviewed": gemini_reviewed,
                        "gemini_total": total_rows,
                        "processed": len(df),
                        "matched": matched,
                        "auto_stored": matched,
                        "new_items_created": new_items_created,
                        "needs_review": needs_review,
                        "upload_id": upload_id,
                    },
                )

        if upload_id is not None:
            Path(file_path).unlink(missing_ok=True)

        return {
            "processed": len(df),
            "matched": matched,
            "auto_stored": matched,
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
