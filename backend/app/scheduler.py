import logging
import os
from datetime import datetime
from typing import Optional

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
except ImportError:  # pragma: no cover - defensive fallback
    BackgroundScheduler = None  # type: ignore[assignment]
    CronTrigger = None  # type: ignore[assignment]

from app.tasks.government_price_ingestion import ingest_government_prices_task

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler() if BackgroundScheduler is not None else None


def setup_scheduler() -> Optional[object]:
    if scheduler is None or CronTrigger is None:
        logger.warning("APScheduler is not available; background scheduling is disabled.")
        return None

    scheduler.add_job(
        lambda: ingest_government_prices_task.delay(
            "https://www.dpwh.gov.ph/dpwh/bureaus-and-services/bureau-construction",
            "DPWH_CMPD",
            _quarter_from_date(datetime.utcnow()),
        ),
        trigger=CronTrigger(month="1,4,7,10", day="1", hour="2", minute="0"),
        id="quarterly_government_price_ingestion",
        replace_existing=True,
    )
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
