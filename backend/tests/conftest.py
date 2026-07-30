import pytest
from sqlalchemy.orm import Session

from app.database import engine, init_db
from app.ingest.models import MaterialPriceVariance, ProcessedFileLog
from app.models import Category, Items

# Ensure the test database schema exists for these database-backed tests.
init_db()

# Seed data mirrors CANDIDATES in test_normalizer_mock.py, adapted to real inserts.
SEED_ITEMS = [
    {
        "category_type": "Structural",
        "item_name": "Portland Cement Type 1",
        "material": "Cement",
        "brand": "Holcim",
        "unit": "bag",
    },
    {
        "category_type": "Structural",
        "item_name": "Deformed Steel Bar 10mm",
        "material": "Steel",
        "brand": "Generic",
        "unit": "length",
    },
    {
        "category_type": "Finishing",
        "item_name": "Latex Paint White",
        "material": "Paint",
        "brand": "Boysen",
        "unit": "gallon",
    },
]


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    # create_savepoint mode means a session.commit() (as the normalize_price_list
    # task issues) only releases a SAVEPOINT, not the outer transaction below —
    # so the final transaction.rollback() still discards everything.
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    categories = {
        category_type: Category(category_type=category_type, category_desc=f"{category_type} materials")
        for category_type in {row["category_type"] for row in SEED_ITEMS}
    }
    session.add_all(categories.values())
    session.flush()

    seeded_items = [
        Items(
            category_id=categories[row["category_type"]].category_id,
            item_name=row["item_name"],
            brand=row["brand"],
            unit=row["unit"],
            item_source="Internal",
            description=row["material"],
        )
        for row in SEED_ITEMS
    ]
    session.add_all(seeded_items)
    session.flush()

    # The real dev DB this connects to accumulates permanent rows from actual
    # usage (read-committed, so visible here too) — get_item_candidates() will
    # keep returning more than just what this fixture seeded as that grows.
    # Exposing the seeded item_codes lets tests that need a fixed, known
    # candidate set filter down to exactly these, instead of assuming the full
    # catalog is only what this fixture created.
    session.seeded_item_codes = {item.item_code for item in seeded_items}

    yield session

    session.close()
    # Rolling back means seeded rows never persist beyond the test, even against
    # a real dev database and even if the test fails partway through.
    transaction.rollback()
    connection.close()
