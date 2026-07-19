from pathlib import Path

from app.services.candidates import get_item_candidates
from app.services.normalize_batch import normalize_pricelist
from app.services.pricelist_parser import parse_pricelist_file

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"


def test_normalize_pricelist_against_seeded_candidates(db_session):
    # Scoped to just this fixture's own rows — the real dev DB this connects to
    # accumulates permanent items from actual usage, and get_item_candidates()
    # correctly returns all of them, not just what this test seeded.
    candidates = [
        c for c in get_item_candidates(db_session) if c["item_code"] in db_session.seeded_item_codes
    ]
    df = parse_pricelist_file(str(FIXTURE))

    results = normalize_pricelist(df, candidates)

    assert len(results) == len(df) == 10

    matched = [r for r in results if not r.is_new_item]
    new_items = [r for r in results if r.is_new_item]

    # 3 exact + 3 near-match (typo/abbreviation) rows resolve against the 3 seeded
    # items; the remaining 4 rows describe materials with no seeded counterpart.
    assert len(matched) == 6
    assert len(new_items) == 4
    assert all(r.matched_item_code is not None for r in matched)
    assert all(r.matched_item_code is None for r in new_items)
