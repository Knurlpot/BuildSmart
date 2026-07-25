import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from celery.result import AsyncResult
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import get_db
from app.ingest.models import MaterialPriceVariance
from app.models import HistoricalPriceRecord, Items, PriceListReviewItem
from app.schemas.pricelist import NormalizedPriceRecord, SourceAgency
from app.services.dpwh_published import fetch_dpwh_cmpd_release, save_dpwh_cmpd_publish_records
from app.services.pricelist_json_normalizer import normalize_pricelist_dataframe
from app.services.pricelist_parser import parse_pricelist_file
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


class UploadResponse(BaseModel):
    task_id: str


class StatusResponse(BaseModel):
    status: str
    result: dict | None = None


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


@router.post("/upload", response_model=UploadResponse)
async def upload_pricelist(
    file: UploadFile = File(...),
    source: str = Form(...),
    supplier_id: int | None = Form(None),
    use_mock: bool | None = Form(None),
):
    suffix = Path(file.filename).suffix
    dest = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    task = normalize_price_list.delay(str(dest), source, supplier_id, use_mock)
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
