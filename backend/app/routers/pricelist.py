import shutil
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from celery.result import AsyncResult
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import get_db
from app.models import Category, HistoricalPriceRecord, Items, MaterialPriceVariance, PriceListReviewItem, PriceListUpload, SourcePriority
from app.schemas.pricelist import NormalizedPriceRecord, SourceAgency
from app.services.match_cache import invalidate_cached_match, upsert_cached_match
from app.services.file_hash import calculate_file_hash, calculate_file_size
from app.services.philippine_regions import infer_region_from_location
from app.services.pricelist_json_normalizer import normalize_pricelist_dataframe
from app.services.pricelist_parser import MissingColumnsError, parse_pricelist_file
from app.services.published_version_check import check_published_version
from app.tasks.normalize_price_list import normalize_price_list

router = APIRouter(prefix="/pricelist", tags=["pricelist"])

# No existing upload-storage convention was found anywhere in the repo (Python or
# Next.js side), so this is a new local directory scoped to the backend, gitignored.
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

TASK_STATE_MAP = {
    "PENDING": "pending",
    "STARTED": "processing",
    "RETRY": "processing",
    "SUCCESS": "done",
    "FAILURE": "failed",
}


def _default_period() -> tuple[str, int]:
    now = datetime.now()
    quarter = f"Q{((now.month - 1) // 3) + 1}"
    return quarter, now.year


def _effective_date_from_period(quarter: str | None, year: int | None) -> date:
    if quarter in {"Q1", "Q2", "Q3", "Q4"} and year is not None:
        start_month = {"Q1": 1, "Q2": 4, "Q3": 7, "Q4": 10}[quarter]
        return date(year, start_month, 1)
    return date.today()


def _parse_effective_date(value: str | None, quarter: str | None = None, year: int | None = None) -> date:
    if not value:
        return _effective_date_from_period(quarter, year)
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid effective_date: {value}. Use YYYY-MM-DD") from exc


class UploadResponse(BaseModel):
    task_id: str | None = None
    status: str | None = None
    message: str | None = None
    upload_id: int | None = None
    allow_skip_review: bool | None = None
    records_imported: int | None = None


class MissingColumnsResponse(BaseModel):
    error: str
    missing_columns: list[str]
    available_columns: list[str]
    detected_mapping: dict[str, str]
    preview_rows: list[dict]
    upload_id: str


class StatusResponse(BaseModel):
    status: str
    result: dict | None = None


class ClearReviewResponse(BaseModel):
    deleted_count: int


class ReviewItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    review_id: int
    raw_name: str
    raw_unit: str
    raw_price: float | None
    confidence: float
    suggested_category_type: str | None
    suggested_material: str | None
    suggested_brand: str | None
    description: str | None
    color: str | None
    region: str | None = None
    location: str | None = None
    company_id: int | None
    source: str
    supplier_id: int | None
    supplier_name: str | None = None
    status: str
    created_at: datetime
    upload_id: int | None = None


class ReviewItemUpdateRequest(BaseModel):
    raw_name: str | None = Field(default=None, min_length=1, max_length=255)
    raw_unit: str | None = Field(default=None, min_length=1, max_length=30)
    raw_price: float | None = Field(default=None, gt=0)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    suggested_category_type: str | None = Field(default=None, max_length=40)
    suggested_material: str | None = Field(default=None, max_length=255)
    suggested_brand: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    color: str | None = Field(default=None, max_length=50)
    region: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    status: str | None = Field(default=None, min_length=1, max_length=20)


def _review_item_response(row: PriceListReviewItem, supplier_name: str | None = None) -> ReviewItemResponse:
    return ReviewItemResponse.model_validate(row).model_copy(update={"supplier_name": supplier_name})


class VersionCheckRequest(BaseModel):
    source: SourceAgency
    region: str | None = None


class VersionCheckResponse(BaseModel):
    status: Literal["up_to_date", "new_available"]
    release_label: str


class FetchPublishedRequest(BaseModel):
    source: SourceAgency
    region: str | None = None


class FetchPublishedResponse(BaseModel):
    auto_saved_count: int
    flagged: list[dict] = Field(default_factory=list)


class PsaIndexRequest(BaseModel):
    source: Literal["PSA"] | None = "PSA"
    region: str | None = None


class PsaIndexEntry(BaseModel):
    commodity_group: str | None
    quarter: str
    year: int
    percent_change: float
    trend_direction: str
    is_significant_spike: bool


class PsaIndexResponse(BaseModel):
    index: list[PsaIndexEntry]


class DpwhCatalogRow(BaseModel):
    historicalrec_id: int
    item_code: int
    item_name: str | None
    category_type: str | None
    region: str | None
    location: str | None = None
    effective_date: date
    quarter: str | None
    year: int | None
    price: float


class ResolveDeviationRequest(BaseModel):
    item_code: int
    quarter: str
    year: int
    action: Literal["approve", "reject"]


class ResolveBulkRequest(BaseModel):
    items: list[dict]
    action: Literal["approve", "reject"]


class SourcePriorityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    priority_id: int | None = None
    company_id: int
    price_source: str
    priority_rank: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SourcePriorityUpdateRequest(BaseModel):
    priorities: list[dict[str, int]]  # [{"price_source": "DPWH", "priority_rank": 1}, ...]


def _resolve_category_id(db: Session, category_type: str | None) -> int:
    if category_type:
        category_type = category_type.strip()
        # .first() rather than .scalar_one_or_none() — category_type has no
        # uniqueness constraint, and the real catalog already has more than
        # one "Structural" row; picking the lowest id is deterministic and
        # avoids crashing approval on a pre-existing data duplicate.
        category = db.execute(
            select(Category)
            .where(Category.category_type == category_type)
            .order_by(Category.category_id)
        ).scalars().first()
        if category is not None:
            return category.category_id

        created = Category(category_type=category_type, category_desc=f"{category_type} materials")
        db.add(created)
        db.flush()
        return created.category_id

    fallback = db.execute(select(Category).order_by(Category.category_id)).scalars().first()
    if fallback is not None:
        return fallback.category_id

    created = Category(category_type="Others", category_desc="Others materials")
    db.add(created)
    db.flush()
    return created.category_id


def _find_existing_item(
    db: Session,
    *,
    item_name: str,
    description: str | None,
    brand: str,
    unit: str,
    item_source: str,
    company_id: int | None,
) -> Items | None:
    statement = (
        select(Items)
        .where(func.lower(Items.item_name) == item_name.lower())
        .where(func.lower(Items.brand) == brand.lower())
        .where(func.lower(Items.unit) == unit.lower())
        .where(func.lower(Items.item_source) == item_source.lower())
    )
    if description:
        statement = statement.where(func.lower(func.coalesce(Items.description, "")) == description.lower())
    else:
        statement = statement.where(func.coalesce(Items.description, "") == "")
    if company_id is None:
        statement = statement.where(Items.company_id.is_(None))
    else:
        statement = statement.where(Items.company_id == company_id)
    return db.execute(statement.order_by(Items.item_code.desc())).scalars().first()


def _find_existing_item_for_price_update(
    db: Session,
    *,
    item_name: str,
    unit: str,
    item_source: str,
    company_id: int | None,
    brand: str,
    description: str | None,
) -> Items | None:
    strict = _find_existing_item(
        db,
        item_name=item_name,
        description=description,
        brand=brand,
        unit=unit,
        item_source=item_source,
        company_id=company_id,
    )
    if strict is not None:
        return strict

    statement = (
        select(Items)
        .where(func.lower(Items.item_name) == item_name.lower())
        .where(func.lower(Items.unit) == unit.lower())
        .where(func.lower(Items.item_source) == item_source.lower())
    )
    if brand and brand.lower() != "generic":
        statement = statement.where(func.lower(Items.brand) == brand.lower())
    if company_id is None:
        statement = statement.where(Items.company_id.is_(None))
    else:
        statement = statement.where((Items.company_id.is_(None)) | (Items.company_id == company_id))
    return db.execute(statement.order_by(Items.company_id.desc().nulls_last(), Items.item_code.desc())).scalars().first()


def _save_review_item_to_catalog(row: PriceListReviewItem, db: Session) -> None:
    item_name = row.raw_name.strip()
    unit = row.raw_unit.strip()
    brand = (row.suggested_brand or "Generic").strip() or "Generic"
    description = (row.description or "").strip() or None
    color = (row.color or "").strip() or None
    source = row.source.strip()
    supplier_id = row.supplier_id
    company_id = row.company_id
    price_region = row.region
    price_location = row.location
    if price_region is None:
        price_region = infer_region_from_location(price_location)
    if source == "DPWH":
        price_region = price_region or "NIR"
        # Backfill compatibility for review rows created before `location`
        # existed, where the DEO was temporarily stored in `region`.
        if price_location is None and price_region not in {
            "Region I", "Region II", "Region III", "Region IV-A", "Region IV-B",
            "Region V", "Region VI", "Region VII", "Region VIII", "Region IX",
            "Region X", "Region XI", "Region XII", "Region XIII", "CAR", "NCR",
            "NIR", "BARMM",
        }:
            price_location = price_region
            price_region = "NIR"
    upload = db.get(PriceListUpload, row.upload_id) if row.upload_id is not None else None
    effective_date = upload.effective_date if upload is not None and upload.effective_date is not None else _effective_date_from_period(None, None)

    if supplier_id is not None:
        supplier_exists = db.execute(
            text("SELECT 1 FROM suppliers WHERE supplier_id = :supplier_id"),
            {"supplier_id": supplier_id},
        ).scalar_one_or_none()
        if supplier_exists is None:
            supplier_id = None

    existing = _find_existing_item_for_price_update(
        db,
        item_name=item_name,
        description=description,
        brand=brand,
        unit=unit,
        item_source=source,
        company_id=company_id,
    )

    if existing is None:
        item = Items(
            category_id=_resolve_category_id(db, row.suggested_category_type),
            company_id=company_id,
            item_name=item_name,
            brand=brand,
            unit=unit,
            color=color,
            item_source=source,
            source_location=None,
            description=description,
        )
        db.add(item)
        db.flush()
    else:
        item = existing
        if color and not item.color:
            item.color = color
        if description and not item.description:
            item.description = description

    existing_price_statement = (
        select(HistoricalPriceRecord)
        .where(HistoricalPriceRecord.item_code == item.item_code)
        .where(HistoricalPriceRecord.price_source == source)
        .where(HistoricalPriceRecord.region == price_region if price_region is not None else HistoricalPriceRecord.region.is_(None))
        .where(HistoricalPriceRecord.location == price_location if price_location is not None else HistoricalPriceRecord.location.is_(None))
    )
    if supplier_id is None:
        existing_price_statement = existing_price_statement.where(HistoricalPriceRecord.supplier_id.is_(None))
    else:
        existing_price_statement = existing_price_statement.where(HistoricalPriceRecord.supplier_id == supplier_id)
    existing_price_statement = existing_price_statement.where(HistoricalPriceRecord.effective_date == effective_date)
    existing_price = db.execute(
        existing_price_statement.order_by(
            HistoricalPriceRecord.effective_date.desc(),
            HistoricalPriceRecord.recorded_at.desc(),
            HistoricalPriceRecord.historicalrec_id.desc(),
        )
    ).scalars().first()

    if existing_price is None:
        db.add(
            HistoricalPriceRecord(
                item_code=item.item_code,
                supplier_id=supplier_id,
                price_source=source,
                region=price_region,
                location=price_location,
                effective_date=effective_date,
                quarter=upload.quarter if upload is not None else None,
                year=upload.year if upload is not None else None,
                price=float(row.raw_price),
            )
        )
    else:
        existing_price.price = float(row.raw_price)
        existing_price.effective_date = effective_date
        existing_price.quarter = upload.quarter if upload is not None else None
        existing_price.year = upload.year if upload is not None else None
        existing_price.recorded_at = datetime.now()

    # Remember this human-confirmed mapping so future uploads of the same raw
    # text skip re-scoring entirely (see app.services.match_cache). Keyed on
    # the row's raw text as originally submitted, not the resolved item_name —
    # that's what a future upload's raw row will actually look like.
    upsert_cached_match(db, row.raw_name, row.raw_unit, item.item_code, company_id=row.company_id)


def _refresh_upload_review_status(upload_id: int | None, db: Session, imported_delta: int = 0) -> None:
    if upload_id is None:
        return

    upload = db.get(PriceListUpload, upload_id)
    if upload is None:
        return

    if imported_delta:
        upload.records_imported = (upload.records_imported or 0) + imported_delta

    pending_count = db.execute(
        select(func.count())
        .select_from(PriceListReviewItem)
        .where(PriceListReviewItem.upload_id == upload_id)
        .where(PriceListReviewItem.status == "Pending")
    ).scalar_one()
    if pending_count == 0:
        upload.processing_status = "completed"


def _upload_has_review_history(upload_id: int, db: Session) -> bool:
    review_count = db.execute(
        select(func.count())
        .select_from(PriceListReviewItem)
        .where(PriceListReviewItem.upload_id == upload_id)
    ).scalar_one()
    return review_count > 0


def _upload_has_catalog_rows(upload: PriceListUpload, db: Session) -> bool:
    statement = (
        select(func.count())
        .select_from(HistoricalPriceRecord)
        .join(Items, HistoricalPriceRecord.item_code == Items.item_code)
        .where(HistoricalPriceRecord.price_source == (upload.source or "Supplier"))
        .where(HistoricalPriceRecord.effective_date == upload.effective_date)
    )
    if upload.supplier_id is None:
        statement = statement.where(HistoricalPriceRecord.supplier_id.is_(None))
    else:
        statement = statement.where(HistoricalPriceRecord.supplier_id == upload.supplier_id)
    statement = statement.where((Items.company_id.is_(None)) | (Items.company_id == upload.company_id))
    return db.execute(statement).scalar_one() > 0


def _find_existing_upload_for_scope(
    db: Session,
    *,
    company_id: int,
    file_hash: str,
    effective_date,
    source: str,
    supplier_id: int | None,
) -> PriceListUpload | None:
    statement = (
        select(PriceListUpload)
        .where(
            PriceListUpload.company_id == company_id,
            PriceListUpload.file_hash == file_hash,
            PriceListUpload.effective_date == effective_date,
            PriceListUpload.source == (source.strip() or "Supplier"),
        )
        .order_by(PriceListUpload.upload_timestamp.desc(), PriceListUpload.upload_id.desc())
    )
    if supplier_id is None:
        statement = statement.where(PriceListUpload.supplier_id.is_(None))
    else:
        statement = statement.where(PriceListUpload.supplier_id == supplier_id)
    return db.execute(statement).scalars().first()


@router.post("/upload", response_model=UploadResponse, response_model_exclude_none=True)
async def upload_pricelist(
    file: UploadFile = File(...),
    source: str = Form(...),
    supplier_id: int | None = Form(None),
    company_id: int | None = Form(None),
    quarter: str | None = Form(None),
    year: int | None = Form(None),
    effective_date: str | None = Form(None),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename).suffix
    file_upload_token = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_upload_token}{suffix}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    default_quarter, default_year = _default_period()
    period_quarter, period_year = quarter or default_quarter, year or default_year
    upload_effective_date = _parse_effective_date(effective_date, period_quarter, period_year)
    file_hash = calculate_file_hash(dest)
    file_size = calculate_file_size(dest)
    db_upload: PriceListUpload | None = None
    force_review_for_cross_company_file = False

    if company_id is not None:
        cross_company_upload = db.execute(
            select(PriceListUpload)
            .where(
                PriceListUpload.company_id != company_id,
                PriceListUpload.file_hash == file_hash,
                PriceListUpload.effective_date == upload_effective_date,
                PriceListUpload.processing_status == "completed",
            )
            .order_by(PriceListUpload.upload_timestamp.desc(), PriceListUpload.upload_id.desc())
        ).scalars().first()
        force_review_for_cross_company_file = cross_company_upload is not None

        existing_upload = _find_existing_upload_for_scope(
            db,
            company_id=company_id,
            file_hash=file_hash,
            effective_date=upload_effective_date,
            source=source,
            supplier_id=supplier_id,
        )

        existing_upload_is_reviewed = (
            existing_upload is not None
            and (
                not force_review_for_cross_company_file
                or _upload_has_review_history(existing_upload.upload_id, db)
            )
        )

        if (
            existing_upload is not None
            and existing_upload.processing_status == "completed"
            and existing_upload_is_reviewed
            and _upload_has_catalog_rows(existing_upload, db)
        ):
            dest.unlink(missing_ok=True)
            return UploadResponse(
                status="already_approved",
                message=f"This file was already processed on {existing_upload.upload_timestamp}",
                upload_id=existing_upload.upload_id,
                allow_skip_review=True,
                records_imported=existing_upload.records_imported,
            )

        if existing_upload is not None:
            db_upload = existing_upload
            db_upload.file_name = file.filename or "unknown"
            db_upload.file_size = file_size
            db_upload.source = source.strip() or "Supplier"
            db_upload.supplier_id = supplier_id
            db_upload.effective_date = upload_effective_date
            db_upload.quarter = period_quarter
            db_upload.year = period_year
            db_upload.processing_status = "pending"
            db_upload.records_imported = None
            db_upload.error_message = None
        else:
            db_upload = PriceListUpload(
                company_id=company_id,
                file_name=file.filename or "unknown",
                file_hash=file_hash,
                file_size=file_size,
                source=source.strip() or "Supplier",
                supplier_id=supplier_id,
                effective_date=upload_effective_date,
                quarter=period_quarter,
                year=period_year,
                processing_status="pending",
            )
            db.add(db_upload)
        db.commit()
        db.refresh(db_upload)

    # Validated synchronously (not inside the Celery task) so a column-match
    # failure comes back as an immediate, structured response the frontend
    # can turn into a ColumnMappingStep prompt — rather than surfacing only
    # after a poll cycle as an opaque task failure. The saved file is kept
    # (not deleted) so /upload/{upload_id}/confirm-mapping can reuse it
    # instead of asking the user to re-select and re-upload the same file.
    try:
        parse_pricelist_file(str(dest))
    except MissingColumnsError as exc:
        return JSONResponse(
            status_code=422,
            content=MissingColumnsResponse(
                error=str(exc),
                missing_columns=exc.missing_columns,
                available_columns=exc.available_columns,
                detected_mapping=exc.detected_mapping,
                preview_rows=exc.preview_rows,
                upload_id=file_upload_token,
            ).model_dump(),
        )
    except ValueError as exc:
        # Not every column-match failure qualifies for the structured
        # MissingColumnsError path (see parse_pricelist_file's narrow gate for
        # it) — an unsupported extension, unreadable file, or a wide/generic
        # header set still raises a plain ValueError, and that must reach the
        # client as a clean 4xx too, not bubble up as an unhandled 500.
        if db_upload is not None:
            db_upload.processing_status = "failed"
            db_upload.error_message = str(exc)
            db.commit()
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    task = normalize_price_list.delay(
        str(dest),
        source,
        supplier_id,
        None,
        company_id,
        upload_id=db_upload.upload_id if db_upload is not None else None,
        quarter=period_quarter,
        year=period_year,
        effective_date=upload_effective_date.isoformat(),
        force_review=force_review_for_cross_company_file,
    )
    return UploadResponse(task_id=task.id)


@router.post("/upload/{upload_id}/confirm-mapping", response_model=UploadResponse, response_model_exclude_none=True)
async def confirm_column_mapping(
    upload_id: str,
    raw_name_column: str = Form(...),
    raw_unit_column: str = Form(...),
    raw_price_column: str = Form(...),
    source: str = Form(...),
    supplier_id: int | None = Form(None),
    company_id: int | None = Form(None),
    quarter: str | None = Form(None),
    year: int | None = Form(None),
    effective_date: str | None = Form(None),
    db: Session = Depends(get_db),
):
    matches = list(UPLOAD_DIR.glob(f"{upload_id}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Upload not found — it may have already been processed")
    dest = matches[0]
    default_quarter, default_year = _default_period()
    period_quarter, period_year = quarter or default_quarter, year or default_year
    upload_effective_date = _parse_effective_date(effective_date, period_quarter, period_year)
    db_upload: PriceListUpload | None = None
    force_review_for_cross_company_file = False

    if company_id is not None:
        file_hash = calculate_file_hash(dest)
        file_size = calculate_file_size(dest)
        cross_company_upload = db.execute(
            select(PriceListUpload)
            .where(
                PriceListUpload.company_id != company_id,
                PriceListUpload.file_hash == file_hash,
                PriceListUpload.effective_date == upload_effective_date,
                PriceListUpload.processing_status == "completed",
            )
            .order_by(PriceListUpload.upload_timestamp.desc(), PriceListUpload.upload_id.desc())
        ).scalars().first()
        force_review_for_cross_company_file = cross_company_upload is not None

        existing_upload = _find_existing_upload_for_scope(
            db,
            company_id=company_id,
            file_hash=file_hash,
            effective_date=upload_effective_date,
            source=source,
            supplier_id=supplier_id,
        )

        existing_upload_is_reviewed = (
            existing_upload is not None
            and (
                not force_review_for_cross_company_file
                or _upload_has_review_history(existing_upload.upload_id, db)
            )
        )

        if (
            existing_upload is not None
            and existing_upload.processing_status == "completed"
            and existing_upload_is_reviewed
            and _upload_has_catalog_rows(existing_upload, db)
        ):
            dest.unlink(missing_ok=True)
            return UploadResponse(
                status="already_approved",
                message=f"This file was already processed on {existing_upload.upload_timestamp}",
                upload_id=existing_upload.upload_id,
                allow_skip_review=True,
                records_imported=existing_upload.records_imported,
            )

        if existing_upload is not None:
            db_upload = existing_upload
            db_upload.file_size = file_size
            db_upload.source = source.strip() or "Supplier"
            db_upload.supplier_id = supplier_id
            db_upload.effective_date = upload_effective_date
            db_upload.quarter = period_quarter
            db_upload.year = period_year
            db_upload.processing_status = "pending"
            db_upload.records_imported = None
            db_upload.error_message = None
        else:
            db_upload = PriceListUpload(
                company_id=company_id,
                file_name=dest.name,
                file_hash=file_hash,
                file_size=file_size,
                source=source.strip() or "Supplier",
                supplier_id=supplier_id,
                effective_date=upload_effective_date,
                quarter=period_quarter,
                year=period_year,
                processing_status="pending",
            )
            db.add(db_upload)
        db.commit()
        db.refresh(db_upload)

    column_mapping = {
        "raw_name": raw_name_column,
        "raw_unit": raw_unit_column,
        "raw_price": raw_price_column,
    }

    try:
        parse_pricelist_file(str(dest), column_mapping=column_mapping)
    except MissingColumnsError as exc:
        return JSONResponse(
            status_code=422,
            content=MissingColumnsResponse(
                error=str(exc),
                missing_columns=exc.missing_columns,
                available_columns=exc.available_columns,
                detected_mapping=exc.detected_mapping,
                preview_rows=exc.preview_rows,
                upload_id=upload_id,
            ).model_dump(),
        )
    except ValueError as exc:
        if db_upload is not None:
            db_upload.processing_status = "failed"
            db_upload.error_message = str(exc)
            db.commit()
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    task = normalize_price_list.delay(
        str(dest),
        source,
        supplier_id,
        column_mapping,
        company_id,
        upload_id=db_upload.upload_id if db_upload is not None else None,
        quarter=period_quarter,
        year=period_year,
        effective_date=upload_effective_date.isoformat(),
        force_review=force_review_for_cross_company_file,
    )
    return UploadResponse(task_id=task.id)


@router.get("/status/{task_id}", response_model=StatusResponse)
def get_task_status(task_id: str):
    async_result = AsyncResult(task_id, app=celery_app)
    status = TASK_STATE_MAP.get(async_result.state, "processing")

    if async_result.state == "SUCCESS":
        result = async_result.result
    elif async_result.state == "FAILURE":
        # async_result.result is the exception instance itself on failure —
        # stringify it so callers actually see why it failed instead of null.
        result = {"error": str(async_result.result)}
    else:
        result = None

    return StatusResponse(status=status, result=result)


@router.get("/review", response_model=list[ReviewItemResponse])
def list_review_items(
    company_id: int | None = None,
    latest_upload_only: bool = False,
    db: Session = Depends(get_db),
):
    statement = select(PriceListReviewItem).where(PriceListReviewItem.status == "Pending")
    if company_id is not None:
        statement = statement.where(PriceListReviewItem.company_id == company_id)
    if latest_upload_only:
        latest_upload_statement = (
            select(PriceListUpload.upload_id)
            .where(PriceListUpload.processing_status == "processing")
            .order_by(PriceListUpload.upload_timestamp.desc(), PriceListUpload.upload_id.desc())
            .limit(1)
        )
        if company_id is not None:
            latest_upload_statement = latest_upload_statement.where(PriceListUpload.company_id == company_id)
        latest_upload_id = db.execute(latest_upload_statement).scalar_one_or_none()
        if latest_upload_id is None:
            return []
        statement = statement.where(PriceListReviewItem.upload_id == latest_upload_id)
    rows = db.execute(statement).scalars().all()
    if not rows:
        return []

    supplier_ids = sorted({row.supplier_id for row in rows if row.supplier_id is not None})
    supplier_names: dict[int, str] = {}
    if supplier_ids:
        for supplier_id in supplier_ids:
            supplier_name = db.execute(
                text("SELECT supplier_name FROM suppliers WHERE supplier_id = :supplier_id"),
                {"supplier_id": supplier_id},
            ).scalar_one_or_none()
            if supplier_name is not None:
                supplier_names[supplier_id] = supplier_name
    return [_review_item_response(row, supplier_names.get(row.supplier_id)) for row in rows]


@router.delete("/review", response_model=ClearReviewResponse)
def clear_pending_review(company_id: int | None = None, db: Session = Depends(get_db)):
    # Scoped to Pending only, matching list_review_items — an Approved/Rejected/
    # Deleted row (from the per-row PATCH workflow below) isn't shown in this
    # list and shouldn't be touched by a button whose whole premise is "clear
    # what I see". Hard DELETE (not a status flip like the per-row path) is
    # intentional here — this is a bulk "wipe pipeline-test clutter" action,
    # not a reviewed decision that needs an audit trail.
    statement = delete(PriceListReviewItem).where(PriceListReviewItem.status == "Pending")
    if company_id is not None:
        statement = statement.where(PriceListReviewItem.company_id == company_id)
    result = db.execute(statement)
    db.commit()
    return ClearReviewResponse(deleted_count=result.rowcount)


@router.patch("/review/{review_id}", response_model=ReviewItemResponse)
def update_review_item(
    review_id: int,
    payload: ReviewItemUpdateRequest,
    db: Session = Depends(get_db),
):
    row = db.get(PriceListReviewItem, review_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Review item not found")

    previous_status = row.status
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(row, field, value)

    imported_delta = 0
    if row.status == "Approved":
        if row.raw_price is None:
            raise HTTPException(status_code=400, detail="Enter a price before approving this review item")
        _save_review_item_to_catalog(row, db)
        imported_delta = 1 if previous_status != "Approved" else 0
    elif row.status in ("Deleted", "Rejected"):
        # A human just dismissed this raw text/unit combination — if a prior
        # approval had cached it, don't keep trusting that mapping on future
        # uploads. A miss just falls through to normal scoring, same as if it
        # had never been cached.
        invalidate_cached_match(db, row.raw_name, row.raw_unit, company_id=row.company_id)

    if row.status in ("Approved", "Deleted", "Rejected"):
        _refresh_upload_review_status(row.upload_id, db, imported_delta=imported_delta)

    db.commit()
    db.refresh(row)
    supplier_name = None
    if row.supplier_id is not None:
        supplier_name = db.execute(
            text("SELECT supplier_name FROM suppliers WHERE supplier_id = :supplier_id"),
            {"supplier_id": row.supplier_id},
        ).scalar_one_or_none()
    return _review_item_response(row, supplier_name)


@router.post("/fetch-published", response_model=FetchPublishedResponse)
def fetch_published(
    payload: FetchPublishedRequest = Body(...),
):
    raise HTTPException(status_code=410, detail="DPWH CMPD scraping has been removed. Upload DPWH releases manually instead.")


@router.post("/check-version", response_model=VersionCheckResponse)
def check_version(
    payload: VersionCheckRequest = Body(...),
):
    if payload.source not in {"DPWH", "PSA"}:
        raise HTTPException(status_code=400, detail="Unsupported source for version check")
    result = check_published_version(payload.source, payload.region)
    return VersionCheckResponse(**result)


@router.post("/fetch-published-index", response_model=PsaIndexResponse)
def fetch_published_index(
    payload: PsaIndexRequest = Body(default_factory=PsaIndexRequest),
    db: Session = Depends(get_db),
):
    if payload.region and payload.region != "NCR":
        raise HTTPException(status_code=400, detail="PSA index is NCR only")

    rows = db.execute(
        select(MaterialPriceVariance)
        .where(MaterialPriceVariance.variance_source == "PSA")
        .order_by(MaterialPriceVariance.year.desc(), MaterialPriceVariance.quarter.desc(), MaterialPriceVariance.commodity_group)
    ).scalars().all()

    return PsaIndexResponse(
        index=[
            PsaIndexEntry(
                commodity_group=row.commodity_group,
                quarter=row.quarter,
                year=row.year,
                percent_change=float(row.percent_change),
                trend_direction=row.trend_direction,
                is_significant_spike=row.is_significant_spike,
            )
            for row in rows
        ]
    )


@router.get("/catalog/dpwh", response_model=list[DpwhCatalogRow])
def get_dpwh_catalog(db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            HistoricalPriceRecord.historicalrec_id,
            HistoricalPriceRecord.item_code,
            Items.item_name,
            Category.category_type,
            HistoricalPriceRecord.region,
            HistoricalPriceRecord.location,
            HistoricalPriceRecord.effective_date,
            HistoricalPriceRecord.quarter,
            HistoricalPriceRecord.year,
            HistoricalPriceRecord.price,
        )
        .select_from(HistoricalPriceRecord)
        .outerjoin(Items, HistoricalPriceRecord.item_code == Items.item_code)
        .outerjoin(Category, Items.category_id == Category.category_id)
        .where(HistoricalPriceRecord.price_source == "DPWH")
        .order_by(HistoricalPriceRecord.effective_date.desc(), HistoricalPriceRecord.recorded_at.desc())
    ).all()

    return [
        DpwhCatalogRow(
            historicalrec_id=row.historicalrec_id,
            item_code=row.item_code,
            item_name=row.item_name,
            category_type=row.category_type,
            region=row.region,
            location=row.location,
            effective_date=row.effective_date,
            quarter=row.quarter,
            year=row.year,
            price=float(row.price),
        )
        for row in rows
    ]


@router.delete("/catalog/dpwh/{historicalrec_id}", response_model=dict)
def delete_dpwh_catalog_record(historicalrec_id: int, db: Session = Depends(get_db)):
    # Scoped to price_source == "DPWH" so this endpoint can't be used to delete a
    # Supplier/PSA/Internal record by guessing an id — matches the same scoping
    # get_dpwh_catalog reads with. Deletes only this one price observation, not
    # the underlying Items row or its other price history (see Price Catalog's
    # "remove a record, not the catalog item" scope).
    record = db.get(HistoricalPriceRecord, historicalrec_id)
    if record is None or record.price_source != "DPWH":
        raise HTTPException(status_code=404, detail="DPWH price record not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}


@router.post("/deviations/resolve", response_model=dict)
def resolve_deviation(
    payload: ResolveDeviationRequest = Body(...),
):
    # Placeholder: approve/reject actions currently do not mutate persisted data.
    return {"resolved": True}


@router.post("/deviations/resolve-bulk", response_model=dict)
def resolve_bulk_deviations(
    payload: ResolveBulkRequest = Body(...),
):
    return {"resolved_count": len(payload.items)}


@router.post("/normalize", response_model=list[NormalizedPriceRecord])
async def normalize_pricelist_file(
    file: UploadFile = File(...),
    source: SourceAgency = Form(...),
    region: str | None = Form(None),
):
    suffix = Path(file.filename).suffix
    dest = UPLOAD_DIR / f"normalize-{uuid.uuid4()}{suffix}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    df = parse_pricelist_file(str(dest))
    records = normalize_pricelist_dataframe(df, source_agency=source, region=region)
    return records


@router.get("/source-priority/{company_id}", response_model=list[SourcePriorityResponse])
def get_source_priority(company_id: int, db: Session = Depends(get_db)):
    """Get the source priority ranking for a company."""
    priorities = db.execute(
        select(SourcePriority)
        .where(SourcePriority.company_id == company_id)
        .order_by(SourcePriority.priority_rank)
    ).scalars().all()
    
    if not priorities:
        # Return default priorities if none exist
        default_sources = [
            {"priority_id": None, "company_id": company_id, "price_source": "Internal", "priority_rank": 1},
            {"priority_id": None, "company_id": company_id, "price_source": "Supplier", "priority_rank": 2},
            {"priority_id": None, "company_id": company_id, "price_source": "PSA", "priority_rank": 3},
            {"priority_id": None, "company_id": company_id, "price_source": "DPWH", "priority_rank": 4},
        ]
        return default_sources
    
    return priorities


@router.post("/source-priority/{company_id}", response_model=list[SourcePriorityResponse])
def update_source_priority(
    company_id: int,
    request: SourcePriorityUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update the source priority ranking for a company."""
    # Validate that all required sources are provided
    valid_sources = {"DPWH", "PSA", "Supplier", "Internal"}
    provided_sources = {item["price_source"] for item in request.priorities}
    
    if not provided_sources.issubset(valid_sources):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid price sources. Must be one of: {', '.join(valid_sources)}"
        )
    
    if len(provided_sources) != len(valid_sources):
        raise HTTPException(
            status_code=400,
            detail=f"All price sources must be included. Missing: {', '.join(valid_sources - provided_sources)}"
        )
    
    # Validate ranks are sequential starting from 1
    ranks = {item["priority_rank"] for item in request.priorities}
    expected_ranks = set(range(1, len(valid_sources) + 1))
    if ranks != expected_ranks:
        raise HTTPException(
            status_code=400,
            detail=f"Priority ranks must be sequential from 1 to {len(valid_sources)}"
        )
    
    # Delete existing priorities for this company
    db.execute(delete(SourcePriority).where(SourcePriority.company_id == company_id))
    
    # Insert new priorities
    new_priorities = []
    for item in request.priorities:
        sp = SourcePriority(
            company_id=company_id,
            price_source=item["price_source"],
            priority_rank=item["priority_rank"]
        )
        db.add(sp)
        new_priorities.append(sp)
    
    db.commit()
    
    return new_priorities


@router.get("/categories", response_model=list[dict])
def get_categories(db: Session = Depends(get_db)):
    """Get all construction material categories."""
    categories = db.execute(select(Category)).scalars().all()
    return [
        {
            "category_id": cat.category_id,
            "category_type": cat.category_type,
            "category_desc": cat.category_desc,
        }
        for cat in categories
    ]
