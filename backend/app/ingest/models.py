from datetime import datetime

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    DECIMAL,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProcessedFileLog(Base):
    __tablename__ = "processed_file_log"

    file_id: Mapped[int] = mapped_column(primary_key=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    quarter: Mapped[str] = mapped_column(String(2), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    records_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_log: Mapped[str | None] = mapped_column(String(2048))
    processed_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class MaterialPriceVariance(Base):
    __tablename__ = "material_price_variance"
    __table_args__ = (
        CheckConstraint("quarter IN ('Q1','Q2','Q3','Q4')", name="ck_mpv_quarter"),
        CheckConstraint("trend_direction IN ('Up','Down','Stable')", name="ck_mpv_trend_direction"),
    )

    mpv_id: Mapped[int] = mapped_column(primary_key=True)
    item_code: Mapped[int | None] = mapped_column(ForeignKey("items.item_code"), nullable=True)
    variance_source: Mapped[str] = mapped_column(String(20), nullable=False)
    commodity_group: Mapped[str | None] = mapped_column(String(60))
    quarter: Mapped[str] = mapped_column(String(2), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    percent_change: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False)
    trend_direction: Mapped[str] = mapped_column(String(10), nullable=False)
    is_significant_spike: Mapped[bool] = mapped_column(nullable=False, default=False)
