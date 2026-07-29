import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import get_db
from app.models import PriceListReviewItem
from app.services.pricelist_parser import MissingColumnsError, parse_pricelist_file
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


class UploadResponse(BaseModel):
    task_id: str


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
    raw_price: float
    confidence: float
    suggested_category_type: str | None
    suggested_material: str | None
    suggested_brand: str | None
    description: str | None
    source: str
    supplier_id: int | None
    status: str
    created_at: datetime


class ReviewItemUpdateRequest(BaseModel):
    raw_name: str | None = Field(default=None, min_length=1, max_length=100)
    raw_unit: str | None = Field(default=None, min_length=1, max_length=30)
    raw_price: float | None = Field(default=None, gt=0)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    suggested_category_type: str | None = Field(default=None, max_length=40)
    suggested_material: str | None = Field(default=None, max_length=100)
    suggested_brand: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    status: str | None = Field(default=None, min_length=1, max_length=20)


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
    region: str | None
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


def _resolve_category_id(db: Session, category_type: str | None) -> int:
    if category_type:
        category = db.execute(
            select(Category).where(Category.category_type == category_type.strip())
        ).scalar_one_or_none()
        if category is not None:
            return category.category_id

    fallback = db.execute(select(Category).order_by(Category.category_id)).scalars().first()
    if fallback is not None:
        return fallback.category_id

    created = Category(category_type="Others", category_desc="Auto-generated category")
    db.add(created)
    db.flush()
    return created.category_id


def _find_existing_item(
    db: Session,
    *,
    item_name: str,
    material: str,
    brand: str,
    unit: str,
    item_source: str,
) -> Items | None:
    return db.execute(
        select(Items)
        .where(func.lower(Items.item_name) == item_name.lower())
        .where(func.lower(Items.material) == material.lower())
        .where(func.lower(Items.brand) == brand.lower())
        .where(func.lower(Items.unit) == unit.lower())
        .where(func.lower(Items.item_source) == item_source.lower())
        .order_by(Items.item_code.desc())
    ).scalars().first()


def _save_review_item_to_catalog(row: PriceListReviewItem, db: Session) -> None:
    item_name = row.raw_name.strip()
    unit = row.raw_unit.strip()
    material = (row.suggested_material or row.raw_name).strip() or row.raw_name.strip()
    brand = (row.suggested_brand or "Generic").strip() or "Generic"
    source = row.source.strip()
    supplier_id = row.supplier_id

    if supplier_id is not None:
        supplier_exists = db.execute(
            text("SELECT 1 FROM suppliers WHERE supplier_id = :supplier_id"),
            {"supplier_id": supplier_id},
        ).scalar_one_or_none()
        if supplier_exists is None:
            supplier_id = None

    existing = _find_existing_item(
        db,
        item_name=item_name,
        material=material,
        brand=brand,
        unit=unit,
        item_source=source,
    )

    if existing is None:
        item = Items(
            category_id=_resolve_category_id(db, row.suggested_category_type),
            item_name=item_name,
            material=material,
            brand=brand,
            unit=unit,
            item_source=source,
        )
        db.add(item)
        db.flush()
    else:
        item = existing

    # Avoid duplicate historical rows from repeated approve clicks.
    duplicate = db.execute(
        select(HistoricalPriceRecord)
        .where(HistoricalPriceRecord.item_code == item.item_code)
        .where(HistoricalPriceRecord.supplier_id == supplier_id)
        .where(HistoricalPriceRecord.price_source == source)
        .where(HistoricalPriceRecord.price == float(row.raw_price))
        .order_by(HistoricalPriceRecord.historicalrec_id.desc())
    ).scalars().first()

    if duplicate is None:
        db.add(
            HistoricalPriceRecord(
                item_code=item.item_code,
                supplier_id=supplier_id,
                price_source=source,
                price=float(row.raw_price),
            )
        )


@router.post("/upload", response_model=UploadResponse)
async def upload_pricelist(
    file: UploadFile = File(...),
    source: str = Form(...),
    supplier_id: int | None = Form(None),
    use_mock: bool | None = Form(None),
):
    suffix = Path(file.filename).suffix
    upload_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{upload_id}{suffix}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

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
                upload_id=upload_id,
            ).model_dump(),
        )

    task = normalize_price_list.delay(str(dest), source, supplier_id, use_mock)
    return UploadResponse(task_id=task.id)


@router.post("/upload/{upload_id}/confirm-mapping", response_model=UploadResponse)
async def confirm_column_mapping(
    upload_id: str,
    raw_name_column: str = Form(...),
    raw_unit_column: str = Form(...),
    raw_price_column: str = Form(...),
    source: str = Form(...),
    supplier_id: int | None = Form(None),
    use_mock: bool | None = Form(None),
):
    matches = list(UPLOAD_DIR.glob(f"{upload_id}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Upload not found — it may have already been processed")
    dest = matches[0]

    column_mapping = {
        "raw_name": raw_name_column,
        "raw_unit": raw_unit_column,
        "raw_price": raw_price_column,
    }

    try:
        parse_pricelist_file(str(dest), column_mapping=column_mapping)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    task = normalize_price_list.delay(str(dest), source, supplier_id, use_mock, column_mapping)
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
def list_review_items(db: Session = Depends(get_db)):
    rows = db.execute(
        select(PriceListReviewItem).where(PriceListReviewItem.status == "Pending")
    ).scalars().all()
    return rows


@router.patch("/review/{review_id}", response_model=ReviewItemResponse)
def update_review_item(
    review_id: int,
    payload: ReviewItemUpdateRequest,
    db: Session = Depends(get_db),
):
    row = db.get(PriceListReviewItem, review_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Review item not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(row, field, value)

    if row.status == "Approved":
        _save_review_item_to_catalog(row, db)

    db.commit()
    db.refresh(row)
    return row


@router.post("/fetch-published", response_model=FetchPublishedResponse)
def fetch_published(
    payload: FetchPublishedRequest = Body(...),
    db: Session = Depends(get_db),
):
    if payload.source != "DPWH":
        raise HTTPException(status_code=400, detail="Only DPWH published source is supported for this endpoint")
    if not payload.region:
        raise HTTPException(status_code=400, detail="region is required for DPWH published fetch")

    try:
        release_payload = fetch_dpwh_cmpd_release(payload.region)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DPWH fetch failed: {exc}") from exc

    saved_count = save_dpwh_cmpd_publish_records(db, release_payload)
    return FetchPublishedResponse(auto_saved_count=saved_count, flagged=[])


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
            HistoricalPriceRecord.region,
            HistoricalPriceRecord.quarter,
            HistoricalPriceRecord.year,
            HistoricalPriceRecord.price,
        )
        .select_from(HistoricalPriceRecord)
        .outerjoin(Items, HistoricalPriceRecord.item_code == Items.item_code)
        .where(HistoricalPriceRecord.price_source == "DPWH")
        .order_by(HistoricalPriceRecord.recorded_at.desc())
    ).all()

    return [
        DpwhCatalogRow(
            historicalrec_id=row.historicalrec_id,
            item_code=row.item_code,
            item_name=row.item_name,
            region=row.region,
            quarter=row.quarter,
            year=row.year,
            price=float(row.price),
        )
        for row in rows
    ]


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
