from app.services.candidates import get_item_candidates

EXPECTED_KEYS = {"item_code", "item_name", "category_type", "material", "brand", "unit"}


def test_returns_list_of_dicts_with_expected_shape(db_session):
    candidates = get_item_candidates(db_session)

    assert isinstance(candidates, list)
    assert len(candidates) >= 3

    for candidate in candidates:
        assert isinstance(candidate, dict)
        assert set(candidate.keys()) == EXPECTED_KEYS
