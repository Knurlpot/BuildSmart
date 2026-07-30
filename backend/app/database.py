import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# .env lives at the repo root (shared with the Next.js frontend), one level up from backend/.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    # Import model modules so their tables are registered on Base.metadata before
    # create_all runs. create_all only creates missing tables; it does not drop
    # or overwrite existing data.
    from app import models  # noqa: F401
    from app.ingest import models as ingest_models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
