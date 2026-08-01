from datetime import date, datetime

from sqlalchemy import Boolean, Date, TIMESTAMP, ForeignKey, Numeric, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MaterialPrice(Base):
    __tablename__ = "material_price"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    material_name: Mapped[str] = mapped_column(String(255), index=True)
    unit: Mapped[str] = mapped_column(String(50))
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2))
    source: Mapped[str] = mapped_column(String(50))
    source_url: Mapped[str] = mapped_column(String(500), default="https://www.dpwh.gov.ph/dpwh/bureaus-and-services/bureau-construction")
    effective_quarter: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


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
    brand: Mapped[str] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(30))
    color: Mapped[str | None] = mapped_column(String(50))
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
    effective_date: Mapped[date] = mapped_column(Date, default=date.today)
    quarter: Mapped[str | None] = mapped_column(String(2))
    year: Mapped[int | None] = mapped_column(SmallInteger)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    recorded_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("item_code", "supplier_id", "price_source", "effective_date", name="uq_historical_price"),
    )


class Quotation(Base):
    __tablename__ = "quotation"

    quote_id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int]
    user_id: Mapped[int]
    client_id: Mapped[int | None]
    project_name: Mapped[str] = mapped_column(String(150))
    project_location: Mapped[str] = mapped_column(String(255))
    project_region: Mapped[str] = mapped_column(String(30))
    input_method: Mapped[str] = mapped_column(String(30))
    blueprint_file_path: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), server_default="Draft")
    total_material_cost: Mapped[float] = mapped_column(Numeric(15, 2), server_default="0")
    total_service_cost: Mapped[float] = mapped_column(Numeric(15, 2), server_default="0")
    grand_total: Mapped[float] = mapped_column(Numeric(15, 2), server_default="0")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class QuotationItems(Base):
    __tablename__ = "quotation_items"

    quote_item_id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("quotation.quote_id"))
    item_code: Mapped[int] = mapped_column(ForeignKey("items.item_code"))
    supplier_id: Mapped[int | None]
    quantity: Mapped[float] = mapped_column(Numeric(12, 2))
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2))
    markup_percentage: Mapped[float] = mapped_column(Numeric(5, 2), server_default="0")
    final_unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    total_cost: Mapped[float] = mapped_column(Numeric(15, 2))
    source_type: Mapped[str] = mapped_column(String(20))
    source_price_id: Mapped[int | None] = mapped_column(ForeignKey("historical_price_record.historicalrec_id"))
    last_refreshed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    is_price_locked: Mapped[bool] = mapped_column(Boolean, server_default="false")
    original_unit_cost: Mapped[float | None] = mapped_column(Numeric(12, 2))

    __table_args__ = (
        UniqueConstraint("quote_id", "item_code", name="uq_quote_item"),
    )


class QuotationPriceHistory(Base):
    __tablename__ = "quotation_price_history"

    price_history_id: Mapped[int] = mapped_column(primary_key=True)
    quote_item_id: Mapped[int] = mapped_column(ForeignKey("quotation_items.quote_item_id"))
    unit_cost_before: Mapped[float] = mapped_column(Numeric(12, 2))
    unit_cost_after: Mapped[float] = mapped_column(Numeric(12, 2))
    total_cost_before: Mapped[float | None] = mapped_column(Numeric(15, 2))
    total_cost_after: Mapped[float | None] = mapped_column(Numeric(15, 2))
    changed_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    changed_reason: Mapped[str] = mapped_column(String(100))
    changed_by_user_id: Mapped[int | None]


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
    description: Mapped[str | None] = mapped_column(String(255))
    color: Mapped[str | None] = mapped_column(String(50))
    company_id: Mapped[int | None]
    upload_id: Mapped[int | None]
    source: Mapped[str] = mapped_column(String(20))
    # No Suppliers model mapped yet, matching the same plain-int pattern used by
    # HistoricalPriceRecord.supplier_id.
    supplier_id: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), server_default="Pending")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class PriceListUpload(Base):
    __tablename__ = "price_list_upload"

    upload_id: Mapped[int] = mapped_column(primary_key=True)
    # Company/Supplier tables are not mapped in SQLAlchemy yet. Keep these as
    # ints to match Items.company_id and HistoricalPriceRecord.supplier_id; the
    # SQL schema owns the actual FK constraints.
    company_id: Mapped[int]
    file_name: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    file_size: Mapped[int | None]
    source: Mapped[str | None] = mapped_column(String(20))
    supplier_id: Mapped[int | None]
    effective_date: Mapped[date] = mapped_column(Date, default=date.today)
    quarter: Mapped[str | None] = mapped_column(String(2))
    year: Mapped[int | None] = mapped_column(SmallInteger)
    upload_timestamp: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    processing_status: Mapped[str] = mapped_column(String(20), server_default="pending")
    records_imported: Mapped[int | None]
    error_message: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("company_id", "file_hash", "effective_date", name="uq_company_file_effective_date"),
    )


class ApprovedMatchCache(Base):
    __tablename__ = "approved_match_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Normalized (lowercase, punctuation-stripped, whitespace-collapsed) raw
    # material text and unit — see app.services.match_cache.normalize_match_key.
    # Kept as two columns (rather than one combined key) so either can be
    # inspected/queried independently without re-parsing a joined string.
    company_id: Mapped[int | None]
    normalized_name: Mapped[str] = mapped_column(String(255), index=True)
    normalized_unit: Mapped[str] = mapped_column(String(50), index=True)
    item_code: Mapped[int] = mapped_column(ForeignKey("items.item_code"))
    confirmed_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "normalized_name", "normalized_unit", name="uq_approved_match_cache_company_key"),
    )


class SourcePriority(Base):
    __tablename__ = "source_priority"

    priority_id: Mapped[int] = mapped_column(primary_key=True)
    # No Company model is mapped yet, so keep this as a plain integer like
    # Items.company_id. The database schema still owns the real FK constraint.
    company_id: Mapped[int]
    price_source: Mapped[str] = mapped_column(String(20))
    priority_rank: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
