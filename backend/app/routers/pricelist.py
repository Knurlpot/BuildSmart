import shutil
import uuid
from datetime import datetime
from pathlib import Path

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import get_db
from app.models import PriceListReviewItem
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
