from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Numeric, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Category(Base):
    __tablename__ = "category"

    category_id: Mapped[int] = mapped_column(primary_key=True)
    category_type: Mapped[str] = mapped_column(String(40))
    category_desc: Mapped[str] = mapped_column(String(100))


class Items(Base):
    __tablename__ = "items"

    item_code: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.category_id"))
    # No Company model mapped yet, so this can't be a ForeignKey() without breaking
    # flush-order resolution. Revisit once Company is modeled.
    company_id: Mapped[int | None]
    item_name: Mapped[str] = mapped_column(String(100))
    material: Mapped[str] = mapped_column(String(100))
    brand: Mapped[str] = mapped_column(String(100))
    quality: Mapped[str | None] = mapped_column(String(50))
    unit: Mapped[str] = mapped_column(String(30))
    size_width: Mapped[float | None] = mapped_column(Numeric(8, 2))
    size_length: Mapped[float | None] = mapped_column(Numeric(8, 2))
    color: Mapped[str | None] = mapped_column(String(40))
    item_source: Mapped[str] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(String(255))


class HistoricalPriceRecord(Base):
    __tablename__ = "historical_price_record"

    historicalrec_id: Mapped[int] = mapped_column(primary_key=True)
    item_code: Mapped[int] = mapped_column(ForeignKey("items.item_code"))
    # No Suppliers model mapped yet, so this can't be a ForeignKey() without breaking
    # flush-order resolution. Revisit once Suppliers is modeled.
    supplier_id: Mapped[int | None]
    price_source: Mapped[str] = mapped_column(String(20))
    region: Mapped[str | None] = mapped_column(String(30))
    quarter: Mapped[str | None] = mapped_column(String(2))
    year: Mapped[int | None] = mapped_column(SmallInteger)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    recorded_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class PriceListReviewItem(Base):
    __tablename__ = "pricelist_review_item"

    review_id: Mapped[int] = mapped_column(primary_key=True)
    raw_name: Mapped[str] = mapped_column(String(100))
    raw_unit: Mapped[str] = mapped_column(String(30))
    raw_price: Mapped[float] = mapped_column(Numeric(12, 2))
    confidence: Mapped[float] = mapped_column(Numeric(5, 4))
    suggested_category_type: Mapped[str | None] = mapped_column(String(40))
    suggested_material: Mapped[str | None] = mapped_column(String(100))
    suggested_brand: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20))
    # No Suppliers model mapped yet, matching the same plain-int pattern used by
    # HistoricalPriceRecord.supplier_id.
    supplier_id: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), server_default="Pending")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
