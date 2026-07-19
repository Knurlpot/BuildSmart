import pytest
from sqlalchemy.orm import Session

from app.database import engine
from app.models import Category, Items

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

    session.add_all(
        Items(
            category_id=categories[row["category_type"]].category_id,
            item_name=row["item_name"],
            material=row["material"],
            brand=row["brand"],
            unit=row["unit"],
            item_source="Internal",
        )
        for row in SEED_ITEMS
    )
    session.flush()

    yield session

    session.close()
    # Rolling back means seeded rows never persist beyond the test, even against
    # a real dev database and even if the test fails partway through.
    transaction.rollback()
    connection.close()
