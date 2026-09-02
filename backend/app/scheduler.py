import logging
from typing import Optional

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover - defensive fallback
    BackgroundScheduler = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler() if BackgroundScheduler is not None else None


def setup_scheduler() -> Optional[object]:
    if scheduler is None:
        logger.warning("APScheduler is not available; background scheduling is disabled.")
        return None

    if not scheduler.running:
        scheduler.start()
    return scheduler


def _quarter_from_date(value: datetime) -> str:
    month = value.month
    if month in {1, 2, 3}:
        return f"{value.year}-Q1"
    if month in {4, 5, 6}:
        return f"{value.year}-Q2"
    if month in {7, 8, 9}:
        return f"{value.year}-Q3"
    return f"{value.year}-Q4"
