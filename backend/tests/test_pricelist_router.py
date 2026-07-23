from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import get_db
from app.main import app
from app.models import HistoricalPriceRecord, Items, PriceListReviewItem
from app.routers import pricelist as pricelist_router

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"

client = TestClient(app)


def test_upload_triggers_task_without_a_real_worker():
    fake_result = SimpleNamespace(id="fake-task-id")

    with patch.object(pricelist_router.normalize_price_list, "delay", return_value=fake_result) as mock_delay:
        with FIXTURE.open("rb") as f:
            response = client.post(
                "/pricelist/upload",
                files={"file": ("sample_pricelist.csv", f, "text/csv")},
                data={"source": "Supplier", "supplier_id": "7"},
            )

    assert response.status_code == 200
    assert response.json() == {"task_id": "fake-task-id"}

    assert mock_delay.call_count == 1
    saved_path, source, supplier_id, use_mock = mock_delay.call_args.args
    assert source == "Supplier"
    assert supplier_id == 7
    assert use_mock is None  # not specified in this request's form data
    saved_file = Path(saved_path)
    assert saved_file.exists()
    assert saved_file.suffix == ".csv"
    saved_file.unlink()  # clean up the copy this test caused upload_pricelist() to write


def test_status_endpoint_maps_celery_states():
    cases = [
        ("PENDING", None, "pending", None),
        ("STARTED", None, "processing", None),
        ("SUCCESS", {"processed": 10, "matched": 6, "new_items_created": 0, "needs_review": 4}, "done",
         {"processed": 10, "matched": 6, "new_items_created": 0, "needs_review": 4}),
        ("FAILURE", RuntimeError("boom"), "failed", {"error": "boom"}),
    ]

    for celery_state, celery_result, expected_status, expected_result in cases:
        fake_async_result = SimpleNamespace(state=celery_state, result=celery_result)
        with patch.object(pricelist_router, "AsyncResult", return_value=fake_async_result):
            response = client.get("/pricelist/status/some-task-id")

        assert response.status_code == 200
        assert response.json() == {"status": expected_status, "result": expected_result}


def test_review_list_returns_only_pending_items(db_session):
    pending_item = PriceListReviewItem(
        raw_name="Vinyl Floor Tile 300x300",
        raw_unit="box",
        raw_price=620.00,
        confidence=0.2717,
        suggested_category_type="Structural",
        suggested_material="Cement",
        suggested_brand="Holcim",
        source="Supplier",
        supplier_id=None,
    )
    approved_item = PriceListReviewItem(
        raw_name="Already Reviewed Item",
        raw_unit="pc",
        raw_price=100.00,
        confidence=0.5,
        suggested_category_type="Finishing",
        suggested_material="Paint",
        suggested_brand="Boysen",
        source="Supplier",
        supplier_id=None,
        status="Approved",
    )
    db_session.add_all([pending_item, approved_item])
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.get("/pricelist/review")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    body = response.json()

    # The dev DB this connects to now holds real, permanent rows from actual
    # usage — assert on this test's own rows by id, not on the total count.
    review_ids = {item["review_id"] for item in body}
    assert pending_item.review_id in review_ids
    assert approved_item.review_id not in review_ids

    matched = next(item for item in body if item["review_id"] == pending_item.review_id)
    assert matched["raw_name"] == "Vinyl Floor Tile 300x300"
    assert matched["status"] == "Pending"
    assert matched["suggested_category_type"] == "Structural"


def test_check_version_returns_new_available():
    response = client.post(
        "/pricelist/check-version",
        json={"source": "DPWH", "region": "NCR"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "new_available"
    assert "DPWH CMPD" in response.json()["release_label"]


def test_fetch_published_saves_dpwh_records(db_session):
    sample_payload = {
        "rows": [
            {
                "item_name": "Portland Cement Type 1",
                "unit": "bag",
                "price": 260.0,
                "region": "NCR",
                "quarter": "Q1",
                "year": 2026,
            }
        ]
    }

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with patch.object(pricelist_router, "fetch_dpwh_cmpd_release", return_value=sample_payload):
            response = client.post(
                "/pricelist/fetch-published",
                json={"source": "DPWH", "region": "NCR"},
            )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    assert response.json() == {"auto_saved_count": 1, "flagged": []}

    saved_row = db_session.execute(
        select(HistoricalPriceRecord).where(HistoricalPriceRecord.price_source == "DPWH")
    ).scalar_one()
    assert saved_row.region == "NCR"
    assert saved_row.quarter == "Q1"
    assert saved_row.year == 2026
    assert float(saved_row.price) == 260.0


def test_get_dpwh_catalog_returns_rows(db_session):
    item = db_session.query(Items).filter_by(item_name="Portland Cement Type 1").first()
    assert item is not None

    record = HistoricalPriceRecord(
        item_code=item.item_code,
        supplier_id=None,
        price_source="DPWH",
        region="NCR",
        quarter="Q1",
        year=2026,
        price=270.0,
    )
    db_session.add(record)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.get("/pricelist/catalog/dpwh")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["item_code"] == item.item_code
    assert body[0]["region"] == "NCR"
    assert body[0]["quarter"] == "Q1"
    assert body[0]["year"] == 2026
    assert body[0]["price"] == 270.0
