import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.ingest.router import router as ingest_router
from app.routers import pricelist
from app.scheduler import setup_scheduler

# .env lives at the repo root (shared with the Next.js frontend), one level up from backend/.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

FRONTEND_ORIGIN = os.environ["FRONTEND_ORIGIN"]

init_db()

app = FastAPI(title="BuildSmart API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(pricelist.router)
app.include_router(ingest_router)
setup_scheduler()
