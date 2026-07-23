import shutil
import uuid
from datetime import datetime
from pathlib import Path

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
    source: str
    supplier_id: int | None
    status: str
    created_at: datetime


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


@router.delete("/review", response_model=ClearReviewResponse)
def clear_pending_review(db: Session = Depends(get_db)):
    # Scoped to Pending only, matching list_review_items — an Approved/Rejected
    # row (from some future real review workflow) isn't shown in this list and
    # shouldn't be touched by a button whose whole premise is "clear what I see".
    result = db.execute(delete(PriceListReviewItem).where(PriceListReviewItem.status == "Pending"))
    db.commit()
    return ClearReviewResponse(deleted_count=result.rowcount)
