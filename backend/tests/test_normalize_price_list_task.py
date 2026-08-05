from pathlib import Path

import pytest
import pandas as pd
from sqlalchemy import select, text

import app.tasks.normalize_price_list as normalize_price_list_module
from app.models import ApprovedMatchCache, Category, HistoricalPriceRecord, Items, PriceListReviewItem
from app.services.candidates import get_item_candidates
from app.services.match_cache import normalize_match_key
from app.tasks.normalize_price_list import normalize_price_list

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"


def test_normalize_price_list_raises_value_error_for_missing_columns(tmp_path, db_session):
    bad_file = tmp_path / "bad.csv"
    bad_file.write_text("name,unit\nCement,bag\n")

    with pytest.raises(ValueError, match="missing required column"):
        normalize_price_list(
            file_path=str(bad_file),
            source="Supplier",
            supplier_id=None,
            db=db_session,
        )


def test_normalize_price_list_writes_matched_rows_and_flags_new_items(db_session, monkeypatch):
    # Snapshot existing ids first — the dev DB this connects to now holds real,
    # permanent rows from actual usage (not just this test's own uncommitted
    # data), since it's read-committed and shared with the running app. Diffing
    # against a baseline keeps the assertions correct regardless of what's
    # already there.
    existing_record_ids = {
        r.historicalrec_id for r in db_session.execute(select(HistoricalPriceRecord)).scalars()
    }
    existing_item_codes = {i.item_code for i in db_session.execute(select(Items)).scalars()}
    existing_review_ids = {
        r.review_id for r in db_session.execute(select(PriceListReviewItem)).scalars()
    }

    # The task fetches candidates internally, and get_item_candidates() correctly
    # returns every real item in the (shared, growing) dev DB — not just this
    # fixture's 3 rows. Scope it down so this test's expected 6/4 match split
    # stays correct regardless of what real usage has added to the catalog.
    def scoped_get_item_candidates(db):
        return [c for c in get_item_candidates(db) if c["item_code"] in db_session.seeded_item_codes]

    monkeypatch.setattr(normalize_price_list_module, "get_item_candidates", scoped_get_item_candidates)

    result = normalize_price_list(
        file_path=str(FIXTURE),
        source="Supplier",
        supplier_id=None,
        db=db_session,
    )

    assert result["processed"] == 10
    assert result["matched"] == 5
    assert result["new_items_created"] == 0
    assert result["needs_review"] == 5

    new_records = [
        r
        for r in db_session.execute(select(HistoricalPriceRecord)).scalars()
        if r.historicalrec_id not in existing_record_ids
    ]
    assert len(new_records) == 5
    assert all(r.price_source == "Supplier" for r in new_records)
    assert all(r.supplier_id is None for r in new_records)

    # None of the "new item" rows clear the 0.6 confidence gate under the mock
    # scorer (is_new_item is defined as score < threshold, so this can't fire
    # yet) — so no rows were auto-created here. See task summary.
    new_items = [
        i for i in db_session.execute(select(Items)).scalars() if i.item_code not in existing_item_codes
    ]
    assert len(new_items) == 0

    new_review_items = [
        r
        for r in db_session.execute(select(PriceListReviewItem)).scalars()
        if r.review_id not in existing_review_ids
    ]
    assert len(new_review_items) == 5
    assert {r.raw_name for r in new_review_items} == {
        "Deformd Steel Bar 10 mm",
        "Vinyl Floor Tile 300x300",
        "PVC Pipe 4 inch Schedule 40",
        "Galvanized Iron Sheet 0.6mm",
        "Plywood Marine 3/4 4x8",
    }
    assert all(r.status == "Pending" for r in new_review_items)
    assert all(r.source == "Supplier" for r in new_review_items)


def test_normalize_price_list_uses_cached_match_and_skips_review(db_session, monkeypatch):
    # Same scoping rationale as the test above — the task's own DB query for
    # candidates would otherwise see the real, shared dev catalog.
    def scoped_get_item_candidates(db):
        return [c for c in get_item_candidates(db) if c["item_code"] in db_session.seeded_item_codes]

    monkeypatch.setattr(normalize_price_list_module, "get_item_candidates", scoped_get_item_candidates)

    steel_item_code = next(
        i.item_code
        for i in db_session.execute(select(Items)).scalars()
        if i.item_code in db_session.seeded_item_codes and i.item_name == "Deformed Steel Bar 10mm"
    )
    # Simulate a human having already approved this exact raw text/unit combo
    # (which, uncached, is the abbreviated/typo'd row that normally lands in
    # review — see the 5/5 split asserted above) in some prior upload.
    normalized_name, normalized_unit = normalize_match_key("Deformd Steel Bar 10 mm", "pc")
    db_session.add(
        ApprovedMatchCache(
            normalized_name=normalized_name,
            normalized_unit=normalized_unit,
            item_code=steel_item_code,
        )
    )
    db_session.flush()

    existing_record_ids = {
        r.historicalrec_id for r in db_session.execute(select(HistoricalPriceRecord)).scalars()
    }
    existing_review_ids = {
        r.review_id for r in db_session.execute(select(PriceListReviewItem)).scalars()
    }

    result = normalize_price_list(
        file_path=str(FIXTURE),
        source="Supplier",
        supplier_id=None,
        db=db_session,
    )

    # One row that would otherwise need review now auto-matches via the cache.
    assert result["matched"] == 6
    assert result["needs_review"] == 4

    new_records = [
        r
        for r in db_session.execute(select(HistoricalPriceRecord)).scalars()
        if r.historicalrec_id not in existing_record_ids
    ]
    cached_record = next(
        (r for r in new_records if r.item_code == steel_item_code and float(r.price) == 345.0), None
    )
    assert cached_record is not None

    new_review_items = [
        r
        for r in db_session.execute(select(PriceListReviewItem)).scalars()
        if r.review_id not in existing_review_ids
    ]
    assert "Deformd Steel Bar 10 mm" not in {r.raw_name for r in new_review_items}


def test_normalize_price_list_stores_uploaded_item_metadata_for_matched_rows(tmp_path, db_session, monkeypatch):
    cement_item_code = next(
        i.item_code
        for i in db_session.execute(select(Items)).scalars()
        if i.item_code in db_session.seeded_item_codes and i.item_name == "Portland Cement Type 1"
    )

    def scoped_get_item_candidates(db):
        return [c for c in get_item_candidates(db) if c["item_code"] == cement_item_code]

    monkeypatch.setattr(normalize_price_list_module, "get_item_candidates", scoped_get_item_candidates)

    upload = tmp_path / "metadata.csv"
    pd.DataFrame(
        [
            {
                "Material": "Portland Cement Type 1",
                "Unit": "bag",
                "Price": 250,
                "Description": "Class A 40kg bag",
                "Color": "Gray",
            }
        ]
    ).to_csv(upload, index=False)

    company_id = db_session.execute(
        text(
            "INSERT INTO company (company_name, company_address, contact_email, contact_number, specialization_1) "
            "VALUES ('Metadata Test Co', 'Test Address', 'metadata@example.com', '09170000000', 'General Contractor') "
            "RETURNING company_id"
        )
    ).scalar_one()

    result = normalize_price_list(
        file_path=str(upload),
        source="Supplier",
        supplier_id=None,
        company_id=company_id,
        db=db_session,
    )

    assert result["matched"] == 1
    saved_item = db_session.get(Items, cement_item_code)
    assert saved_item is not None
    assert saved_item.company_id == company_id
    assert saved_item.description == "Class A 40kg bag"
    assert saved_item.color == "Gray"


def test_upload_without_spec_or_brand_keeps_review_spec_blank_and_brand_generic(tmp_path, db_session, monkeypatch):
    cement_item_code = next(
        i.item_code
        for i in db_session.execute(select(Items)).scalars()
        if i.item_code in db_session.seeded_item_codes and i.item_name == "Portland Cement Type 1"
    )

    def scoped_get_item_candidates(db):
        return [c for c in get_item_candidates(db) if c["item_code"] == cement_item_code]

    monkeypatch.setattr(normalize_price_list_module, "get_item_candidates", scoped_get_item_candidates)

    upload = tmp_path / "missing_spec_brand.csv"
    pd.DataFrame(
        [
            {
                "Item Name": "Portland Cement Type 1",
                "Supplier": "BuildPro Supplies Ltd.",
                "Category": "Concrete & Masonry",
                "Unit/UOM": "Bag",
                "Price": 12.5,
            }
        ]
    ).to_csv(upload, index=False)

    existing_review_ids = {
        r.review_id for r in db_session.execute(select(PriceListReviewItem)).scalars()
    }

    result = normalize_price_list(
        file_path=str(upload),
        source="Supplier",
        supplier_id=1,
        company_id=1,
        upload_id=1,
        db=db_session,
    )

    assert result["processed"] == 1
    assert result["needs_review"] == 1

    review_item = next(
        r
        for r in db_session.execute(select(PriceListReviewItem)).scalars()
        if r.review_id not in existing_review_ids
    )
    assert review_item.description == ""
    assert review_item.suggested_brand == "Generic"


def test_blank_description_cell_stays_blank_even_when_supplier_and_brand_are_present(tmp_path, db_session, monkeypatch):
    category_id = db_session.execute(select(Category.category_id).order_by(Category.category_id)).scalars().first()
    assert category_id is not None
    plywood_item = Items(
        category_id=category_id,
        item_name="Plywood Marine Grade 3/4 inch",
        brand="HardPly",
        unit="Sheet",
        item_source="Supplier",
        description=None,
    )
    db_session.add(plywood_item)
    db_session.flush()

    def scoped_get_item_candidates(db):
        return [
            {
                "item_code": plywood_item.item_code,
                "item_name": plywood_item.item_name,
                "material": plywood_item.description or plywood_item.item_name,
                "brand": plywood_item.brand,
                "unit": plywood_item.unit,
                "category_type": "Timber & Lumber",
            }
        ]

    monkeypatch.setattr(normalize_price_list_module, "get_item_candidates", scoped_get_item_candidates)

    upload = tmp_path / "blank_description_cell.csv"
    pd.DataFrame(
        [
            {
                "Item Name": "Plywood Marine Grade 3/4 inch",
                "Supplier": "TimberLand Distro",
                "Brand": "HardPly",
                "Category": "Lumber & Wood",
                "Description": "",
                "Unit/UOM": "Sheet",
                "Price": 45,
            }
        ]
    ).to_csv(upload, index=False)

    existing_review_ids = {
        r.review_id for r in db_session.execute(select(PriceListReviewItem)).scalars()
    }

    result = normalize_price_list(
        file_path=str(upload),
        source="Supplier",
        supplier_id=1,
        company_id=1,
        upload_id=1,
        db=db_session,
    )

    assert result["processed"] == 1
    assert result["needs_review"] == 1

    review_item = next(
        r
        for r in db_session.execute(select(PriceListReviewItem)).scalars()
        if r.review_id not in existing_review_ids
    )
    assert review_item.description == ""
    assert review_item.suggested_brand == "HardPly"


def test_blank_price_cell_stays_blank_in_review(tmp_path, db_session, monkeypatch):
    cement_item_code = next(
        i.item_code
        for i in db_session.execute(select(Items)).scalars()
        if i.item_code in db_session.seeded_item_codes and i.item_name == "Portland Cement Type 1"
    )

    def scoped_get_item_candidates(db):
        return [c for c in get_item_candidates(db) if c["item_code"] == cement_item_code]

    monkeypatch.setattr(normalize_price_list_module, "get_item_candidates", scoped_get_item_candidates)

    upload = tmp_path / "blank_price_cell.csv"
    pd.DataFrame(
        [
            {
                "Item Name": "Portland Cement Type 1",
                "Supplier": "BuildPro Supplies Ltd.",
                "Brand": "Holcim",
                "Category": "Concrete & Masonry",
                "Description": "General purpose 40kg bag portland cement",
                "Unit/UOM": "Bag",
                "Price": "",
            }
        ]
    ).to_csv(upload, index=False)

    existing_review_ids = {
        r.review_id for r in db_session.execute(select(PriceListReviewItem)).scalars()
    }

    result = normalize_price_list(
        file_path=str(upload),
        source="Supplier",
        supplier_id=1,
        company_id=1,
        upload_id=1,
        db=db_session,
    )

    assert result["processed"] == 1
    assert result["needs_review"] == 1

    review_item = next(
        r
        for r in db_session.execute(select(PriceListReviewItem)).scalars()
        if r.review_id not in existing_review_ids
    )
    assert review_item.raw_price is None
