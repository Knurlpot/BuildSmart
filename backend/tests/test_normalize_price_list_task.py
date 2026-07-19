from pathlib import Path

from sqlalchemy import select

from app.models import HistoricalPriceRecord, Items, PriceListReviewItem
from app.tasks.normalize_price_list import normalize_price_list

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"


def test_normalize_price_list_writes_matched_rows_and_flags_new_items(db_session):
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

    result = normalize_price_list(
        file_path=str(FIXTURE),
        source="Supplier",
        supplier_id=None,
        db=db_session,
    )

    assert result["processed"] == 10
    assert result["matched"] == 6
    assert result["new_items_created"] == 0
    assert result["needs_review"] == 4

    new_records = [
        r
        for r in db_session.execute(select(HistoricalPriceRecord)).scalars()
        if r.historicalrec_id not in existing_record_ids
    ]
    assert len(new_records) == 6
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
    assert len(new_review_items) == 4
    assert {r.raw_name for r in new_review_items} == {
        "Vinyl Floor Tile 300x300",
        "PVC Pipe 4 inch Schedule 40",
        "Galvanized Iron Sheet 0.6mm",
        "Plywood Marine 3/4 4x8",
    }
    assert all(r.status == "Pending" for r in new_review_items)
    assert all(r.source == "Supplier" for r in new_review_items)
