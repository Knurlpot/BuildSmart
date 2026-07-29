from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.ingest.models import ProcessedFileLog
from app.ingest.tasks import ingest_dpwh_cmpd, ingest_psa_dataset, normalize_ingested_file

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/dpwh")
def trigger_dpwh_ingest(release_id: str | None = None) -> dict[str, str | int]:
    task = ingest_dpwh_cmpd.delay(release_id)
    return {"task_id": task.id, "source": "DPWH"}


@router.post("/psa")
def trigger_psa_ingest(dataset_id: str | None = None) -> dict[str, str | int]:
    task = ingest_psa_dataset.delay(dataset_id)
    return {"task_id": task.id, "source": "PSA"}


@router.post("/normalize/{file_id}")
def trigger_normalize(file_id: int) -> dict[str, str | int]:
    task = normalize_ingested_file.delay(file_id)
    return {"task_id": task.id, "file_id": file_id}


@router.get("/files")
def list_processed_files(session: Session = Depends(get_db_session)) -> list[dict[str, str | int]]:
    records = session.query(ProcessedFileLog).order_by(ProcessedFileLog.processed_at.desc()).all()
    return [
        {
            "file_id": record.file_id,
            "source_type": record.source_type,
            "file_name": record.file_name,
            "file_url": record.file_url,
            "status": record.status,
            "records_processed": record.records_processed,
            "processed_at": record.processed_at.isoformat(),
        }
        for record in records
    ]


@router.get("/files/{file_id}")
def get_processed_file(file_id: int, session: Session = Depends(get_db_session)) -> dict[str, str | int | None]:
    record = session.get(ProcessedFileLog, file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Processed file not found")

    return {
        "file_id": record.file_id,
        "source_type": record.source_type,
        "file_name": record.file_name,
        "file_url": record.file_url,
        "storage_path": record.storage_path,
        "file_hash": record.file_hash,
        "quarter": record.quarter,
        "year": record.year,
        "records_processed": record.records_processed,
        "status": record.status,
        "error_log": record.error_log,
        "processed_at": record.processed_at.isoformat(),
    }
