from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.blueprint import BlueprintExtractionResult
from app.services.blueprint_extractor import extract_blueprint

router = APIRouter(prefix="/blueprints", tags=["blueprints"])


@router.post("/extract/{quotation_id}", response_model=BlueprintExtractionResult)
async def extract_uploaded_blueprint(quotation_id: int, file: UploadFile = File(...)) -> BlueprintExtractionResult:
    del quotation_id  # Ownership is verified by the authenticated Next.js proxy.
    filename = file.filename or "blueprint"
    try:
        return extract_blueprint(filename, await file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Blueprint extraction failed.") from exc
