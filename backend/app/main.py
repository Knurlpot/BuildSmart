import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import init_db
from app.routers import pricelist
from app.routers import blueprint
from app.scheduler import setup_scheduler

# .env lives at the repo root (shared with the Next.js frontend), one level up from backend/.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

FRONTEND_ORIGIN = os.environ["FRONTEND_ORIGIN"]
BACKEND_INTERNAL_API_KEY = os.environ.get("BACKEND_INTERNAL_API_KEY", "").strip()
IS_PRODUCTION = os.environ.get("ENVIRONMENT", "").lower() == "production" or os.environ.get("NODE_ENV", "").lower() == "production"

if IS_PRODUCTION and not BACKEND_INTERNAL_API_KEY:
    raise RuntimeError("BACKEND_INTERNAL_API_KEY is required in production")

if os.environ.get("AUTO_INIT_DB", "").lower() == "true":
    init_db()

app = FastAPI(title="BuildSmart API")


@app.middleware("http")
async def require_internal_api_key(request: Request, call_next):
    internal_key = BACKEND_INTERNAL_API_KEY
    if internal_key and not secrets.compare_digest(request.headers.get("X-BuildSmart-Internal-Key", ""), internal_key):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(pricelist.router)
app.include_router(blueprint.router)
setup_scheduler()
