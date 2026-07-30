import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApprovedMatchCache

_PUNCTUATION_RE = re.compile(r"[^\w\s]")
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_text(value: str) -> str:
    text = (value or "").strip().lower()
    text = _PUNCTUATION_RE.sub("", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def normalize_match_key(raw_name: str, raw_unit: str) -> tuple[str, str]:
    return _normalize_text(raw_name), _normalize_text(raw_unit)


def get_cache_lookup(db: Session) -> dict[tuple[str, str], int]:
    """One query, reused across every row in a batch — cheaper than a
    per-row SELECT against a table that only grows over time."""
    rows = db.execute(
        select(
            ApprovedMatchCache.normalized_name,
            ApprovedMatchCache.normalized_unit,
            ApprovedMatchCache.item_code,
        )
    ).all()
    return {(row.normalized_name, row.normalized_unit): row.item_code for row in rows}


def upsert_cached_match(db: Session, raw_name: str, raw_unit: str, item_code: int) -> None:
    normalized_name, normalized_unit = normalize_match_key(raw_name, raw_unit)
    if not normalized_name or not normalized_unit:
        return

    existing = db.execute(
        select(ApprovedMatchCache)
        .where(ApprovedMatchCache.normalized_name == normalized_name)
        .where(ApprovedMatchCache.normalized_unit == normalized_unit)
    ).scalars().first()

    if existing is None:
        db.add(
            ApprovedMatchCache(
                normalized_name=normalized_name,
                normalized_unit=normalized_unit,
                item_code=item_code,
            )
        )
    elif existing.item_code != item_code:
        # A correction to a previously-approved mapping — overwrite rather than
        # leave the old (wrong) item_code cached alongside a second entry.
        existing.item_code = item_code


def invalidate_cached_match(db: Session, raw_name: str, raw_unit: str) -> None:
    normalized_name, normalized_unit = normalize_match_key(raw_name, raw_unit)
    if not normalized_name or not normalized_unit:
        return

    existing = db.execute(
        select(ApprovedMatchCache)
        .where(ApprovedMatchCache.normalized_name == normalized_name)
        .where(ApprovedMatchCache.normalized_unit == normalized_unit)
    ).scalars().first()

    if existing is not None:
        db.delete(existing)
