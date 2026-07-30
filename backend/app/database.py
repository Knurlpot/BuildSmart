import os
from contextlib import contextmanager
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
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

    try:
        with engine.begin() as connection:
            connection.execute(text("SET LOCAL lock_timeout = '1000ms'"))
            connection.execute(text("ALTER TABLE pricelist_review_item ADD COLUMN IF NOT EXISTS color VARCHAR(50)"))
            connection.execute(text("ALTER TABLE pricelist_review_item ADD COLUMN IF NOT EXISTS company_id INT"))
            connection.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS color VARCHAR(50)"))
            connection.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS description VARCHAR(255)"))
            connection.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS company_id INT"))
    except OperationalError:
        # Startup should remain available; upload tasks have short lock timeouts
        # and will surface a clear failure if the DB is still locked.
        pass


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
