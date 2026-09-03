import io
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.database import get_db
from app.main import app
from app.models import ApprovedMatchCache, HistoricalPriceRecord, Items, MaterialPriceVariance, PriceListReviewItem, PriceListUpload
from app.routers import pricelist as pricelist_router
from app.services.match_cache import normalize_match_key

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"

client = TestClient(app)


def _insert_supplier(db_session, name: str) -> int:
    slug = name.lower().replace(" ", "-")
    return db_session.execute(
        text(
            "INSERT INTO suppliers (supplier_name, supplier_address, city, region, contact_email, contact_number, supplier_type) "
            "VALUES (:name, 'Test Address', 'Bacolod', 'NIR', :email, '09170000000', 'Distributor') "
            "RETURNING supplier_id"
        ),
        {"name": name, "email": f"{slug}@example.com"},
    ).scalar_one()


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
    saved_path, source, supplier_id, column_mapping, company_id = mock_delay.call_args.args
    assert source == "Supplier"
    assert supplier_id == 7
    assert column_mapping is None
    assert company_id is None
    saved_file = Path(saved_path)
    assert saved_file.exists()
    assert saved_file.suffix == ".csv"
    saved_file.unlink()  # clean up the copy this test caused upload_pricelist() to write


def test_upload_same_file_for_different_supplier_is_not_marked_already_processed(db_session):
    first_supplier_id = _insert_supplier(db_session, "Already Processed Supplier A")
    second_supplier_id = _insert_supplier(db_session, "Already Processed Supplier B")
    company_id = db_session.execute(
        text(
            "INSERT INTO company (company_name, company_address, contact_email, contact_number, specialization_1) "
            "VALUES ('Upload Scope Co', 'Test Address', 'upload-scope@example.com', '09170000000', 'General Contractor') "
            "RETURNING company_id"
        )
    ).scalar_one()

    def override_get_db():
        yield db_session

    fake_result = SimpleNamespace(id="different-supplier-task")
    app.dependency_overrides[get_db] = override_get_db
    try:
        with patch.object(pricelist_router.normalize_price_list, "delay", return_value=fake_result):
            with FIXTURE.open("rb") as f:
                first_response = client.post(
                    "/pricelist/upload",
                    files={"file": ("sample_pricelist.csv", f, "text/csv")},
                    data={
                        "source": "Supplier",
                        "supplier_id": str(first_supplier_id),
                        "company_id": str(company_id),
                        "effective_date": "2026-08-17",
                    },
                )
            assert first_response.status_code == 200

            first_upload = db_session.execute(
                select(PriceListUpload)
                .where(PriceListUpload.company_id == company_id)
                .where(PriceListUpload.supplier_id == first_supplier_id)
            ).scalars().first()
            assert first_upload is not None
            first_upload.processing_status = "completed"
            first_upload.records_imported = 1
            db_session.flush()

            with FIXTURE.open("rb") as f:
                second_response = client.post(
                    "/pricelist/upload",
                    files={"file": ("sample_pricelist.csv", f, "text/csv")},
                    data={
                        "source": "Supplier",
                        "supplier_id": str(second_supplier_id),
                        "company_id": str(company_id),
                        "effective_date": "2026-08-17",
                    },
                )
    finally:
        del app.dependency_overrides[get_db]

    assert second_response.status_code == 200
    assert second_response.json() == {"task_id": "different-supplier-task"}


def test_upload_with_unrecognized_columns_returns_structured_422():
    # "Foo"/"Bar" give zero header signal and aren't generic-named (unlike
    # "Column1" etc, which the parser's content-based inference gate treats
    # differently — see parse_pricelist_file) — this is the combination that
    # reliably reaches the structured MissingColumnsError path.
    csv_bytes = b"Foo,Bar\nPortland Cement Type 1,255.00\n"

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
    assert body["available_columns"] == ["Foo", "Bar"]
    assert body["detected_mapping"] == {}
    assert "upload_id" in body

    _cleanup_upload(body["upload_id"])


def test_upload_unrelated_file_returns_file_not_supported():
    csv_bytes = (
        b"Section,Data Type,Notes\n"
        b"UC-01,unit,\n"
        b"Log-In,unit,\n"
        b"Security,unit,3\n"
        b"Performance,unit,3\n"
        b"This use case outlines the authentication process wherein users provide their login credentials,unit,\n"
        b"Student Instructor Admin,unit,\n"
    )

    with patch.object(pricelist_router.normalize_price_list, "delay") as mock_delay:
        response = client.post(
            "/pricelist/upload",
            files={"file": ("proposal.csv", io.BytesIO(csv_bytes), "text/csv")},
            data={"source": "Supplier"},
        )

    assert mock_delay.call_count == 0
    assert response.status_code == 422
    assert response.json()["detail"] == "File NOT Supported"


def test_confirm_mapping_triggers_task_after_manual_resolution():
    csv_bytes = b"Foo,Bar,Baz\nPortland Cement Type 1,bag,255.00\n"
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
                "raw_name_column": "Foo",
                "raw_unit_column": "Bar",
                "raw_price_column": "Baz",
                "source": "Supplier",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"task_id": "fake-task-id-2"}
    assert mock_delay.call_count == 1
    saved_path, source, supplier_id, column_mapping, company_id = mock_delay.call_args.args
    assert source == "Supplier"
    assert supplier_id is None
    assert column_mapping == {"raw_name": "Foo", "raw_unit": "Bar", "raw_price": "Baz"}
    assert company_id is None

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


def test_review_list_can_return_only_latest_upload_items(db_session):
    company_id = db_session.execute(
        text(
            "INSERT INTO company (company_name, company_address, contact_email, contact_number, specialization_1) "
            "VALUES ('Latest Review Co', 'Test Address', 'latest-review@example.com', '09170000000', 'General Contractor') "
            "RETURNING company_id"
        )
    ).scalar_one()
    older_upload = PriceListUpload(
        company_id=company_id,
        file_name="old.pdf",
        file_hash="old-review-list-hash",
        source="Supplier",
        effective_date="2026-01-01",
        processing_status="processing",
    )
    latest_upload = PriceListUpload(
        company_id=company_id,
        file_name="latest.pdf",
        file_hash="latest-review-list-hash",
        source="Supplier",
        effective_date="2026-01-02",
        processing_status="processing",
    )
    db_session.add_all([older_upload, latest_upload])
    db_session.flush()

    older_item = PriceListReviewItem(
        raw_name="Old broken OCR row",
        raw_unit="unit",
        raw_price=100.00,
        confidence=0.5,
        suggested_category_type="Plumbing & Pipework",
        suggested_material="Old broken OCR row",
        suggested_brand="Generic",
        source="Supplier",
        company_id=company_id,
        upload_id=older_upload.upload_id,
    )
    latest_item = PriceListReviewItem(
        raw_name="PVC Pipe Blue, S-1000 potable",
        raw_unit="pc",
        raw_price=124.00,
        confidence=0.5,
        suggested_category_type="Plumbing & Pipework",
        suggested_material="PVC Pipe Blue, S-1000 potable",
        suggested_brand="Neltex",
        description="20mm x 3m",
        source="Supplier",
        company_id=company_id,
        upload_id=latest_upload.upload_id,
    )
    db_session.add_all([older_item, latest_item])
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.get(f"/pricelist/review?company_id={company_id}&latest_upload_only=true")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    body = response.json()
    review_ids = {item["review_id"] for item in body}
    assert latest_item.review_id in review_ids
    assert older_item.review_id not in review_ids
    matched = next(item for item in body if item["review_id"] == latest_item.review_id)
    assert matched["description"] == "20mm x 3m"
    assert matched["suggested_brand"] == "Neltex"


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


def test_update_review_item_edits_pending_row(db_session):
    item = PriceListReviewItem(
        raw_name="Cemnt Portland Typ 1",
        raw_unit="bg",
        raw_price=240.00,
        confidence=0.0,
        suggested_category_type="Uncategorized",
        suggested_material="Cemnt Portland Typ 1",
        suggested_brand="Generic",
        source="Supplier",
        supplier_id=None,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.patch(
            f"/pricelist/review/{item.review_id}",
            json={
                "raw_name": "Portland Cement Type 1 40kg",
                "raw_unit": "bag",
                "raw_price": 255.5,
                "confidence": 0.8,
                "suggested_category_type": "Concrete & Masonry",
                "suggested_material": "Portland Cement",
                "suggested_brand": "Generic",
            },
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    body = response.json()
    assert body["raw_name"] == "Portland Cement Type 1 40kg"
    assert body["raw_unit"] == "bag"
    assert body["raw_price"] == 255.5
    assert body["confidence"] == 0.8
    assert body["suggested_category_type"] == "Concrete & Masonry"

    db_session.refresh(item)
    assert item.raw_name == "Portland Cement Type 1 40kg"


def test_update_review_item_allows_description_field(db_session):
    item = PriceListReviewItem(
        raw_name="Portland Cement Type 1 40kg",
        raw_unit="bag",
        raw_price=255.50,
        confidence=0.82,
        suggested_category_type="Structural",
        suggested_material="Cement",
        suggested_brand="Holcim",
        description="Class A Portland Cement 40kg Bag",
        source="Supplier",
        supplier_id=None,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.patch(
            f"/pricelist/review/{item.review_id}",
            json={"description": "Class B Portland Cement 40kg Bag"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Class B Portland Cement 40kg Bag"

    db_session.refresh(item)
    assert item.description == "Class B Portland Cement 40kg Bag"


def test_update_review_item_approve_saves_to_supplier_catalog(db_session):
    item = PriceListReviewItem(
        raw_name="Portland Cement Type 1 40kg",
        raw_unit="bag",
        raw_price=255.50,
        confidence=0.82,
        suggested_category_type="Structural",
        suggested_material="Cement",
        suggested_brand="Holcim",
        source="Supplier",
        supplier_id=None,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.patch(
            f"/pricelist/review/{item.review_id}",
            json={"status": "Approved"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Approved"

    saved_item = db_session.execute(
        select(Items)
        .where(Items.item_name == "Portland Cement Type 1 40kg")
        .where(Items.description.is_(None))
        .where(Items.brand == "Holcim")
        .where(Items.unit == "bag")
        .where(Items.item_source == "Supplier")
    ).scalars().first()
    assert saved_item is not None

    saved_price = db_session.execute(
        select(HistoricalPriceRecord)
        .where(HistoricalPriceRecord.item_code == saved_item.item_code)
        .where(HistoricalPriceRecord.supplier_id.is_(None))
        .where(HistoricalPriceRecord.price_source == "Supplier")
    ).scalars().first()
    assert saved_price is not None
    assert float(saved_price.price) == 255.5


def test_update_review_item_approve_creates_supplier_item_even_if_internal_exists(db_session):
    item = PriceListReviewItem(
        raw_name="Portland Cement Type 1",
        raw_unit="bag",
        raw_price=260.00,
        confidence=0.77,
        suggested_category_type="Structural",
        suggested_material="Cement",
        suggested_brand="Holcim",
        source="Supplier",
        supplier_id=None,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.patch(
            f"/pricelist/review/{item.review_id}",
            json={"status": "Approved"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200

    supplier_item = db_session.execute(
        select(Items)
        .where(Items.item_name == "Portland Cement Type 1")
        .where(Items.description.is_(None))
        .where(Items.brand == "Holcim")
        .where(Items.unit == "bag")
        .where(Items.item_source == "Supplier")
    ).scalars().first()
    assert supplier_item is not None


def test_update_review_item_approve_does_not_store_missing_description_as_item_name(db_session):
    item = PriceListReviewItem(
        raw_name="Plywood Marine Grade 3/4 inch",
        raw_unit="Sheet",
        raw_price=45.00,
        confidence=0.74,
        suggested_category_type="Timber & Lumber",
        suggested_material="Plywood Marine Grade 3/4 inch",
        suggested_brand="HardPly",
        description="",
        source="Supplier",
        supplier_id=None,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.patch(
            f"/pricelist/review/{item.review_id}",
            json={"status": "Approved"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200

    saved_item = db_session.execute(
        select(Items)
        .where(Items.item_name == "Plywood Marine Grade 3/4 inch")
        .where(Items.brand == "HardPly")
        .where(Items.unit == "Sheet")
        .where(Items.item_source == "Supplier")
    ).scalars().first()
    assert saved_item is not None
    assert saved_item.description is None


def test_approving_same_supplier_material_updates_existing_supplier_price(db_session):
    supplier_id = _insert_supplier(db_session, "Same Supplier Co")
    material_name = "Regression Same Supplier Cement Board"
    item = PriceListReviewItem(
        raw_name=material_name,
        raw_unit="bag",
        raw_price=255.50,
        confidence=0.82,
        suggested_category_type="Structural",
        suggested_material=material_name,
        suggested_brand="Holcim",
        source="Supplier",
        supplier_id=supplier_id,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        first_response = client.patch(f"/pricelist/review/{item.review_id}", json={"status": "Approved"})
        assert first_response.status_code == 200

        saved_item = db_session.execute(
            select(Items)
            .where(Items.item_name == material_name)
            .where(Items.brand == "Holcim")
            .where(Items.unit == "bag")
            .where(Items.item_source == "Supplier")
        ).scalars().first()
        assert saved_item is not None

        existing_price = db_session.execute(
            select(HistoricalPriceRecord)
            .where(HistoricalPriceRecord.item_code == saved_item.item_code)
            .where(HistoricalPriceRecord.supplier_id == supplier_id)
            .where(HistoricalPriceRecord.price_source == "Supplier")
        ).scalars().one()
        original_price_id = existing_price.historicalrec_id

        second = PriceListReviewItem(
            raw_name=material_name,
            raw_unit="bag",
            raw_price=275.25,
            confidence=0.82,
            suggested_category_type="Structural",
            suggested_material=material_name,
            suggested_brand="Holcim",
            source="Supplier",
            supplier_id=supplier_id,
        )
        db_session.add(second)
        db_session.flush()
        second_response = client.patch(f"/pricelist/review/{second.review_id}", json={"status": "Approved"})
        assert second_response.status_code == 200
    finally:
        del app.dependency_overrides[get_db]

    prices = db_session.execute(
        select(HistoricalPriceRecord)
        .where(HistoricalPriceRecord.item_code == saved_item.item_code)
        .where(HistoricalPriceRecord.supplier_id == supplier_id)
        .where(HistoricalPriceRecord.price_source == "Supplier")
    ).scalars().all()
    assert len(prices) == 1
    assert prices[0].historicalrec_id == original_price_id
    assert float(prices[0].price) == 275.25


def test_approving_different_supplier_same_material_creates_separate_supplier_price(db_session):
    first_supplier_id = _insert_supplier(db_session, "First Supplier Co")
    second_supplier_id = _insert_supplier(db_session, "Second Supplier Co")
    material_name = "Regression Multi Supplier Cement Board"

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        for supplier_id in (first_supplier_id, second_supplier_id):
            item = PriceListReviewItem(
                raw_name=material_name,
                raw_unit="bag",
                raw_price=255.50,
                confidence=0.82,
                suggested_category_type="Structural",
                suggested_material=material_name,
                suggested_brand="Holcim",
                source="Supplier",
                supplier_id=supplier_id,
            )
            db_session.add(item)
            db_session.flush()
            response = client.patch(f"/pricelist/review/{item.review_id}", json={"status": "Approved"})
            assert response.status_code == 200
    finally:
        del app.dependency_overrides[get_db]

    saved_item = db_session.execute(
        select(Items)
        .where(Items.item_name == material_name)
        .where(Items.brand == "Holcim")
        .where(Items.unit == "bag")
        .where(Items.item_source == "Supplier")
    ).scalars().first()
    assert saved_item is not None

    prices = db_session.execute(
        select(HistoricalPriceRecord)
        .where(HistoricalPriceRecord.item_code == saved_item.item_code)
        .where(HistoricalPriceRecord.price_source == "Supplier")
    ).scalars().all()
    assert {price.supplier_id for price in prices} == {first_supplier_id, second_supplier_id}


def test_approving_review_item_writes_approved_match_cache_entry(db_session):
    item = PriceListReviewItem(
        raw_name="Portland Cement Type 1 40kg",
        raw_unit="bag",
        raw_price=255.50,
        confidence=0.82,
        suggested_category_type="Structural",
        suggested_material="Cement",
        suggested_brand="Holcim",
        source="Supplier",
        supplier_id=None,
    )
    db_session.add(item)
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.patch(
            f"/pricelist/review/{item.review_id}",
            json={"status": "Approved"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200

    saved_item = db_session.execute(
        select(Items)
        .where(Items.item_name == "Portland Cement Type 1 40kg")
        .where(Items.brand == "Holcim")
        .where(Items.unit == "bag")
        .where(Items.item_source == "Supplier")
    ).scalars().first()
    assert saved_item is not None

    normalized_name, normalized_unit = normalize_match_key("Portland Cement Type 1 40kg", "bag")
    cached = db_session.execute(
        select(ApprovedMatchCache)
        .where(ApprovedMatchCache.normalized_name == normalized_name)
        .where(ApprovedMatchCache.normalized_unit == normalized_unit)
    ).scalars().first()
    assert cached is not None
    assert cached.item_code == saved_item.item_code


def test_correcting_and_reapproving_same_raw_text_updates_cache_entry(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        first = PriceListReviewItem(
            raw_name="Duplicate Raw Text Item",
            raw_unit="pc",
            raw_price=100.00,
            confidence=0.5,
            suggested_category_type="Finishing",
            suggested_material="Paint",
            suggested_brand="Holcim",  # initially matched under the wrong brand
            source="Supplier",
            supplier_id=None,
        )
        db_session.add(first)
        db_session.flush()
        client.patch(f"/pricelist/review/{first.review_id}", json={"status": "Approved"})

        first_saved_item = db_session.execute(
            select(Items)
            .where(Items.item_name == "Duplicate Raw Text Item")
            .where(Items.brand == "Holcim")
        ).scalars().first()
        assert first_saved_item is not None

        # Same raw text/unit resurfaces and a human corrects the brand this time.
        second = PriceListReviewItem(
            raw_name="Duplicate Raw Text Item",
            raw_unit="pc",
            raw_price=105.00,
            confidence=0.5,
            suggested_category_type="Finishing",
            suggested_material="Paint",
            suggested_brand="Boysen",
            source="Supplier",
            supplier_id=None,
        )
        db_session.add(second)
        db_session.flush()
        client.patch(f"/pricelist/review/{second.review_id}", json={"status": "Approved"})

        second_saved_item = db_session.execute(
            select(Items)
            .where(Items.item_name == "Duplicate Raw Text Item")
            .where(Items.brand == "Boysen")
        ).scalars().first()
        assert second_saved_item is not None
        assert second_saved_item.item_code != first_saved_item.item_code
    finally:
        del app.dependency_overrides[get_db]

    normalized_name, normalized_unit = normalize_match_key("Duplicate Raw Text Item", "pc")
    matching_cache_rows = db_session.execute(
        select(ApprovedMatchCache)
        .where(ApprovedMatchCache.normalized_name == normalized_name)
        .where(ApprovedMatchCache.normalized_unit == normalized_unit)
    ).scalars().all()

    # The correction overwrote the stale entry rather than leaving it alongside a new one.
    assert len(matching_cache_rows) == 1
    assert matching_cache_rows[0].item_code == second_saved_item.item_code


def test_rejecting_review_item_invalidates_matching_cache_entry(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        approved = PriceListReviewItem(
            raw_name="Latex Paint White 4L",
            raw_unit="gallon",
            raw_price=850.00,
            confidence=0.7,
            suggested_category_type="Finishing",
            suggested_material="Paint",
            suggested_brand="Boysen",
            source="Supplier",
            supplier_id=None,
        )
        db_session.add(approved)
        db_session.flush()
        client.patch(f"/pricelist/review/{approved.review_id}", json={"status": "Approved"})

        normalized_name, normalized_unit = normalize_match_key("Latex Paint White 4L", "gallon")
        cached_before = db_session.execute(
            select(ApprovedMatchCache)
            .where(ApprovedMatchCache.normalized_name == normalized_name)
            .where(ApprovedMatchCache.normalized_unit == normalized_unit)
        ).scalars().first()
        assert cached_before is not None

        # A human later dismisses a row with the same raw text/unit as wrong.
        dismissed = PriceListReviewItem(
            raw_name="Latex Paint White 4L",
            raw_unit="gallon",
            raw_price=860.00,
            confidence=0.5,
            suggested_category_type="Finishing",
            suggested_material="Paint",
            suggested_brand="Boysen",
            source="Supplier",
            supplier_id=None,
        )
        db_session.add(dismissed)
        db_session.flush()
        # "Rejected" is the value the DB's CHECK constraint on this column
        # actually allows (Pending/Approved/Rejected) — not "Deleted", which the
        # frontend's deleteReviewItem hook sends and which the DB rejects.
        client.patch(f"/pricelist/review/{dismissed.review_id}", json={"status": "Rejected"})
    finally:
        del app.dependency_overrides[get_db]

    cached_after = db_session.execute(
        select(ApprovedMatchCache)
        .where(ApprovedMatchCache.normalized_name == normalized_name)
        .where(ApprovedMatchCache.normalized_unit == normalized_unit)
    ).scalars().first()
    assert cached_after is None


def test_check_version_reports_dpwh_scraping_removed():
    response = client.post(
        "/pricelist/check-version",
        json={"source": "DPWH", "region": "NCR"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "up_to_date", "release_label": "DPWH CMPD scraping removed"}


def test_fetch_published_dpwh_scraping_removed(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post(
            "/pricelist/fetch-published",
            json={"source": "DPWH", "region": "NCR"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 410
    assert response.json()["detail"] == "DPWH CMPD scraping has been removed. Upload DPWH releases manually instead."


def test_fetch_published_index_returns_psa_variance_rows(db_session):
    db_session.add(
        MaterialPriceVariance(
            item_code=None,
            variance_source="PSA",
            commodity_group="Cement",
            quarter="Q2",
            year=2026,
            percent_change=4.25,
            trend_direction="Up",
            is_significant_spike=True,
        )
    )
    db_session.flush()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post(
            "/pricelist/fetch-published-index",
            json={"source": "PSA", "region": "NCR"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    assert response.json() == {
        "index": [
            {
                "commodity_group": "Cement",
                "quarter": "Q2",
                "year": 2026,
                "percent_change": 4.25,
                "trend_direction": "Up",
                "is_significant_spike": True,
            }
        ]
    }


def test_fetch_published_index_accepts_region_only_payload(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post(
            "/pricelist/fetch-published-index",
            json={"region": "NCR"},
        )
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    assert response.json() == {"index": []}


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


def test_delete_dpwh_catalog_record_removes_only_that_record(db_session):
    item = db_session.query(Items).filter_by(item_name="Portland Cement Type 1").first()
    assert item is not None

    to_delete = HistoricalPriceRecord(
        item_code=item.item_code,
        supplier_id=None,
        price_source="DPWH",
        region="NCR",
        quarter="Q1",
        year=2026,
        price=270.0,
    )
    to_keep = HistoricalPriceRecord(
        item_code=item.item_code,
        supplier_id=None,
        price_source="DPWH",
        region="NCR",
        quarter="Q2",
        year=2026,
        price=280.0,
    )
    db_session.add_all([to_delete, to_keep])
    db_session.flush()
    deleted_id = to_delete.historicalrec_id
    kept_id = to_keep.historicalrec_id

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.delete(f"/pricelist/catalog/dpwh/{deleted_id}")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    assert db_session.get(HistoricalPriceRecord, deleted_id) is None
    # The sibling record for the same item — and the item itself — must survive.
    assert db_session.get(HistoricalPriceRecord, kept_id) is not None
    assert db_session.get(Items, item.item_code) is not None


def test_delete_dpwh_catalog_record_404s_for_unknown_id(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.delete("/pricelist/catalog/dpwh/999999999")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 404


def test_delete_dpwh_catalog_record_404s_for_non_dpwh_source(db_session):
    item = db_session.query(Items).filter_by(item_name="Portland Cement Type 1").first()
    assert item is not None

    supplier_record = HistoricalPriceRecord(
        item_code=item.item_code,
        supplier_id=None,
        price_source="Supplier",
        price=250.0,
    )
    db_session.add(supplier_record)
    db_session.flush()
    record_id = supplier_record.historicalrec_id

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        # Scoped to price_source == "DPWH" — this endpoint must not delete a
        # Supplier-sourced record just because the id happens to exist.
        response = client.delete(f"/pricelist/catalog/dpwh/{record_id}")
    finally:
        del app.dependency_overrides[get_db]

    assert response.status_code == 404
    assert db_session.get(HistoricalPriceRecord, record_id) is not None
