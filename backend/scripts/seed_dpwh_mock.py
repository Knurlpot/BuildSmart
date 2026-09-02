"""Seed clearly labelled DPWH placeholder prices for local development.

Run from the backend directory:

    python scripts/seed_dpwh_mock.py

The seed is idempotent for its release date, region, location, and item. Existing
placeholder rows are updated instead of duplicated. It does not replace genuine
DPWH records.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

from sqlalchemy import func, select, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models import Category, HistoricalPriceRecord, Items  # noqa: E402


RELEASE_DATE = date(2026, 7, 1)
RELEASE_QUARTER = "Q3"
RELEASE_YEAR = 2026
PLACEHOLDER_BRAND = "DPWH Reference"
PLACEHOLDER_DESCRIPTION = "Development placeholder for DPWH CMPD"
ACTUAL_PRICE_FACTORS = (1.08, 1.12, 0.96, 1.05, 1.16, 0.93, 1.10)

MOCK_PRICES = [
    # The current development database still uses its original two-category
    # constraint. Keep the mock compatible until that migration is deployed.
    ("Structural", "Portland Cement Type I, 40 kg", "bag", "NCR", "Placeholder - NCR First DEO", 287.50),
    ("Structural", "Portland Cement Type I, 40 kg", "bag", "Region III", "Placeholder - Pampanga First DEO", 279.00),
    ("Structural", "Concrete Hollow Block 100 mm", "piece", "NCR", "Placeholder - NCR First DEO", 19.75),
    ("Structural", "Washed Sand", "cu.m", "Region IV-A", "Placeholder - Cavite First DEO", 1_420.00),
    ("Structural", "Deformed Steel Bar 10 mm", "piece", "NCR", "Placeholder - NCR First DEO", 191.25),
    ("Structural", "Deformed Steel Bar 12 mm", "piece", "Region III", "Placeholder - Bulacan First DEO", 278.40),
    ("Structural", "Angle Bar 1x1x1/8", "piece", "Region IV-A", "Placeholder - Laguna First DEO", 214.60),
    ("Structural", "Marine Plywood 12 mm", "sheet", "NCR", "Placeholder - NCR Second DEO", 1_178.00),
    ("Structural", "Pre-painted Long Span Roofing 0.4 mm", "sq.m", "Region III", "Placeholder - Tarlac First DEO", 612.50),
    ("Finishing", "Ceramic Floor Tile 300x300", "piece", "Region IV-A", "Placeholder - Rizal First DEO", 68.25),
    ("Finishing", "Latex Paint, White, 16 L", "pail", "NCR", "Placeholder - NCR Second DEO", 2_145.00),
    ("Structural", "PVC Pipe 100 mm, Series 1000", "length", "Region IV-A", "Placeholder - Batangas First DEO", 1_036.00),
    ("Structural", "THHN Copper Wire 3.5 sq.mm", "meter", "NCR", "Placeholder - NCR First DEO", 42.80),
    ("Structural", "Common Wire Nail 4 inch", "kg", "Region III", "Placeholder - Nueva Ecija First DEO", 96.40),
    ("Structural", "Safety Helmet", "piece", "NCR", "Placeholder - NCR First DEO", 228.00),
]


def get_or_create_category(session, category_type: str) -> Category:
    category = session.scalar(select(Category).where(Category.category_type == category_type))
    if category is None:
        category = Category(category_type=category_type, category_desc=f"{category_type} materials")
        session.add(category)
        session.flush()
    return category


def get_or_create_item(session, category: Category, item_name: str, unit: str) -> Items:
    item = session.scalar(
        select(Items)
        .where(func.lower(Items.item_name) == item_name.lower())
        .order_by(Items.company_id.asc().nullsfirst(), Items.item_code.asc())
        .limit(1)
    )
    if item is None:
        # The deployed development database still has a required legacy
        # `material` column that is not present in the current ORM model.
        # Supplying it explicitly keeps this seed compatible with both schemas.
        item_code = session.execute(
            text(
                """
                INSERT INTO items (
                    category_id, company_id, item_name, material, brand, unit,
                    item_source, source_location, description
                ) VALUES (
                    :category_id, NULL, :item_name, :material, :brand, :unit,
                    'DPWH', NULL, :description
                )
                RETURNING item_code
                """
            ),
            {
                "category_id": category.category_id,
                "item_name": item_name,
                "material": item_name,
                "brand": PLACEHOLDER_BRAND,
                "unit": unit,
                "description": PLACEHOLDER_DESCRIPTION,
            },
        ).scalar_one()
        item = session.get(Items, item_code)
        if item is None:
            raise RuntimeError(f"Could not load seeded item {item_code}")
    return item


def upsert_price(
    session,
    *,
    item_code: int,
    price_source: str,
    region: str,
    location: str,
    price: float,
) -> bool:
    record = session.scalar(
        select(HistoricalPriceRecord).where(
            HistoricalPriceRecord.item_code == item_code,
            HistoricalPriceRecord.supplier_id.is_(None),
            HistoricalPriceRecord.price_source == price_source,
            HistoricalPriceRecord.region == region,
            HistoricalPriceRecord.location == location,
            HistoricalPriceRecord.effective_date == RELEASE_DATE,
        )
    )

    if record is None:
        session.add(
            HistoricalPriceRecord(
                item_code=item_code,
                supplier_id=None,
                price_source=price_source,
                region=region,
                location=location,
                effective_date=RELEASE_DATE,
                quarter=RELEASE_QUARTER,
                year=RELEASE_YEAR,
                price=price,
            )
        )
        return True

    record.price = price
    record.quarter = RELEASE_QUARTER
    record.year = RELEASE_YEAR
    return False


def seed() -> tuple[int, int]:
    created = 0
    updated = 0

    with SessionLocal() as session:
        for index, (category_type, item_name, unit, region, location, price) in enumerate(MOCK_PRICES):
            category = get_or_create_category(session, category_type)
            item = get_or_create_item(session, category, item_name, unit)
            dpwh_created = upsert_price(
                session,
                item_code=item.item_code,
                price_source="DPWH",
                region=region,
                location=location,
                price=price,
            )
            created += int(dpwh_created)
            updated += int(not dpwh_created)

            # Price Trends compares Supplier/Internal observations with DPWH by
            # material, unit, category, and region. These clearly labelled local
            # observations make that variance UI useful until uploads provide
            # genuine actual prices.
            actual_location = location.replace("Placeholder -", "Placeholder actual -")
            actual_price = round(price * ACTUAL_PRICE_FACTORS[index % len(ACTUAL_PRICE_FACTORS)], 2)
            actual_created = upsert_price(
                session,
                item_code=item.item_code,
                price_source="Internal",
                region=region,
                location=actual_location,
                price=actual_price,
            )
            created += int(actual_created)
            updated += int(not actual_created)

        session.commit()

    return created, updated


if __name__ == "__main__":
    inserted, refreshed = seed()
    print(f"DPWH comparison placeholder seed complete: {inserted} inserted, {refreshed} updated.")
