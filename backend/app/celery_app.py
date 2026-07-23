import os
from pathlib import Path

from celery import Celery
from dotenv import load_dotenv

# .env lives at the repo root (shared with the Next.js frontend), one level up from backend/.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

REDIS_URL = os.environ["REDIS_URL"]

celery_app = Celery("buildsmart", broker=REDIS_URL, backend=REDIS_URL)
# autodiscover_tasks imports task modules so @shared_task decorators register.
celery_app.autodiscover_tasks(["app", "app.ingest"])
