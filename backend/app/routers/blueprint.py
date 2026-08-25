import logging
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.blueprint import BlueprintExtractionResult, SavedBlueprintExtractionRequest
from app.services.blueprint_extractor import extract_blueprint
from app.services.blueprint_storage import load_blueprint, persist_blueprint, storage_is_configured

router = APIRouter(prefix="/blueprints", tags=["blueprints"])
logger = logging.getLogger(__name__)


@router.post("/extract/{quotation_id}", response_model=BlueprintExtractionResult)
async def extract_uploaded_blueprint(quotation_id: int, file: UploadFile = File(...)) -> BlueprintExtractionResult:
    filename = file.filename or "blueprint"
    started_at = time.perf_counter()
    logger.info("Blueprint extraction requested quotation_id=%s filename=%s", quotation_id, filename)
    try:
        content = await file.read()
        persistence_enabled = storage_is_configured()
        stored_path = None
        persistence_warning = None
        if persistence_enabled:
            try:
                stored = persist_blueprint(quotation_id, filename, content, file.content_type)
                stored_path = stored.path if stored else None
            except Exception:
                persistence_warning = "The scan completed, but the blueprint file could not be saved."
        result = extract_blueprint(filename, content)
        result.persistence_enabled = persistence_enabled
        result.blueprint_file_path = stored_path
        result.persistence_warning = persistence_warning
        logger.info(
            "Blueprint extraction completed quotation_id=%s filename=%s floors=%s segments=%s duration_seconds=%.2f",
            quotation_id,
            filename,
            len(result.floors),
            sum(len(floor.segments) for floor in result.floors),
            time.perf_counter() - started_at,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Blueprint extraction failed.") from exc


@router.post("/rescan/{quotation_id}", response_model=BlueprintExtractionResult)
async def rescan_saved_blueprint(quotation_id: int, request: SavedBlueprintExtractionRequest) -> BlueprintExtractionResult:
    del quotation_id  # Ownership and saved path are verified by the authenticated Next.js proxy.
    try:
        content = load_blueprint(request.blueprint_file_path)
        result = extract_blueprint(Path(request.blueprint_file_path).name, content)
        result.blueprint_file_path = request.blueprint_file_path
        result.persistence_enabled = True
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="The saved blueprint could not be loaded.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Blueprint extraction failed.") from exc
