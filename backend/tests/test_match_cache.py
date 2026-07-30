from sqlalchemy import select

from app.models import ApprovedMatchCache
from app.services.match_cache import (
    get_cache_lookup,
    invalidate_cached_match,
    normalize_match_key,
    upsert_cached_match,
)


def test_normalize_match_key_collapses_case_punctuation_and_whitespace():
    assert normalize_match_key("Portland  Cement, Type-1!!", "  BAG ") == ("portland cement type1", "bag")


def test_upsert_creates_new_entry_and_get_cache_lookup_reflects_it(db_session):
    item_code = next(iter(db_session.seeded_item_codes))

    upsert_cached_match(db_session, "Cemnt Portlnd", "bag", item_code)
    db_session.flush()

    lookup = get_cache_lookup(db_session)
    assert lookup[normalize_match_key("Cemnt Portlnd", "bag")] == item_code


def test_upsert_on_existing_key_updates_item_code_instead_of_duplicating(db_session):
    first_code, second_code = list(db_session.seeded_item_codes)[:2]

    upsert_cached_match(db_session, "Cemnt Portlnd", "bag", first_code)
    db_session.flush()
    upsert_cached_match(db_session, "Cemnt Portlnd", "bag", second_code)
    db_session.flush()

    normalized_name, normalized_unit = normalize_match_key("Cemnt Portlnd", "bag")
    rows = db_session.execute(
        select(ApprovedMatchCache)
        .where(ApprovedMatchCache.normalized_name == normalized_name)
        .where(ApprovedMatchCache.normalized_unit == normalized_unit)
    ).scalars().all()

    assert len(rows) == 1
    assert rows[0].item_code == second_code


def test_invalidate_removes_entry(db_session):
    item_code = next(iter(db_session.seeded_item_codes))
    upsert_cached_match(db_session, "Cemnt Portlnd", "bag", item_code)
    db_session.flush()

    invalidate_cached_match(db_session, "Cemnt Portlnd", "bag")
    db_session.flush()

    lookup = get_cache_lookup(db_session)
    assert normalize_match_key("Cemnt Portlnd", "bag") not in lookup


def test_invalidate_missing_entry_is_a_no_op(db_session):
    invalidate_cached_match(db_session, "Nonexistent Material", "pc")
