import io
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models import PriceListReviewItem
from app.routers import pricelist as pricelist_router

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"

client = TestClient(app)


def _cleanup_upload(upload_id: str) -> None:
    for f in pricelist_router.UPLOAD_DIR.glob(f"{upload_id}.*"):
        f.unlink()


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


def test_upload_with_unrecognized_columns_returns_structured_422():
    csv_bytes = b"Column1,Column2,Column3\nCement,bag,255.00\n"

    with patch.object(pricelist_router.normalize_price_list, "delay") as mock_delay:
        response = client.post(
            "/pricelist/upload",
            files={"file": ("weird.csv", io.BytesIO(csv_bytes), "text/csv")},
            data={"source": "Supplier"},
        )

    assert mock_delay.call_count == 0  # the task must not be queued on a match failure
    assert response.status_code == 422
    body = response.json()
    assert set(body["missing_columns"]) == {"raw_name", "raw_unit", "raw_price"}
    assert body["available_columns"] == ["Column1", "Column2", "Column3"]
    assert body["detected_mapping"] == {}
    assert "upload_id" in body

    _cleanup_upload(body["upload_id"])


def test_confirm_mapping_triggers_task_after_manual_resolution():
    csv_bytes = b"Column1,Column2,Column3\nCement,bag,255.00\n"
    fake_result = SimpleNamespace(id="fake-task-id-2")

    upload_response = client.post(
        "/pricelist/upload",
        files={"file": ("weird2.csv", io.BytesIO(csv_bytes), "text/csv")},
        data={"source": "Supplier"},
    )
    upload_id = upload_response.json()["upload_id"]

    with patch.object(pricelist_router.normalize_price_list, "delay", return_value=fake_result) as mock_delay:
        response = client.post(
            f"/pricelist/upload/{upload_id}/confirm-mapping",
            data={
                "raw_name_column": "Column1",
                "raw_unit_column": "Column2",
                "raw_price_column": "Column3",
                "source": "Supplier",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"task_id": "fake-task-id-2"}
    assert mock_delay.call_count == 1
    saved_path, source, supplier_id, use_mock, column_mapping = mock_delay.call_args.args
    assert column_mapping == {"raw_name": "Column1", "raw_unit": "Column2", "raw_price": "Column3"}

    _cleanup_upload(upload_id)


def test_confirm_mapping_on_unknown_upload_id_returns_404():
    response = client.post(
        "/pricelist/upload/does-not-exist/confirm-mapping",
        data={
            "raw_name_column": "a",
            "raw_unit_column": "b",
            "raw_price_column": "c",
            "source": "Supplier",
        },
    )

    assert response.status_code == 404


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


def test_clear_pending_review_deletes_only_pending_items(db_session):
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
    approved_id = approved_item.review_id

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.delete("/pricelist/review")
        list_response = client.get("/pricelist/review")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    assert response.json()["deleted_count"] >= 1  # at least this test's own pending row

    remaining_ids = {item["review_id"] for item in list_response.json()}
    assert remaining_ids == set()  # every Pending row is gone, this test's included

    # The Approved row must survive — DELETE only targets status == "Pending".
    still_there = db_session.get(PriceListReviewItem, approved_id)
    assert still_there is not None
    assert still_there.status == "Approved"
