from pathlib import Path

import pandas as pd

import app.services.normalize_batch as normalize_batch_module
from app.services.candidates import get_item_candidates
from app.services.match_cache import normalize_match_key
from app.services.normalize_batch import normalize_pricelist
from app.services.normalizer_mock import ItemCandidate
from app.services.pricelist_parser import parse_pricelist_file

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"

CACHE_TEST_CANDIDATES: list[ItemCandidate] = [
    {
        "item_code": 101,
        "category_type": "Structural",
        "item_name": "Portland Cement Type 1",
        "material": "Cement",
        "brand": "Holcim",
        "unit": "bag",
    },
    {
        "item_code": 102,
        "category_type": "Structural",
        "item_name": "Deformed Steel Bar 10mm",
        "material": "Steel",
        "brand": "Generic",
        "unit": "length",
    },
]


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


def test_cache_hit_skips_scoring_entirely_and_returns_max_confidence(monkeypatch):
    def _boom(*args, **kwargs):
        raise AssertionError("normalize_material must not be called for a cached row")

    monkeypatch.setattr(normalize_batch_module, "normalize_material", _boom)

    df = pd.DataFrame([{"raw_name": "Portland Cement Type 1!!", "raw_unit": "BAG", "raw_price": 250.0}])
    cache_lookup = {normalize_match_key("Portland Cement Type 1!!", "BAG"): 101}

    results = normalize_pricelist(df, CACHE_TEST_CANDIDATES, cache_lookup=cache_lookup)

    assert len(results) == 1
    result = results[0]
    assert result.matched_item_code == 101
    assert result.confidence == 1.0
    assert result.is_new_item is False


def test_cache_miss_falls_through_to_normal_scoring(monkeypatch):
    calls = []
    original = normalize_batch_module.normalize_material

    def _spy(raw_name, raw_unit, candidates, raw_brand=None):
        calls.append(raw_name)
        return original(raw_name, raw_unit, candidates, raw_brand=raw_brand)

    monkeypatch.setattr(normalize_batch_module, "normalize_material", _spy)

    df = pd.DataFrame([{"raw_name": "Portland Cement Type 1", "raw_unit": "bag", "raw_price": 250.0}])
    # A cache entry exists, but for different raw text — this row's key isn't in it.
    cache_lookup = {normalize_match_key("some other material", "pc"): 101}

    results = normalize_pricelist(df, CACHE_TEST_CANDIDATES, cache_lookup=cache_lookup)

    assert calls == ["Portland Cement Type 1"]
    assert len(results) == 1
    assert results[0].matched_item_code == 101  # still resolves via normal scoring


def test_stale_cache_entry_pointing_at_unknown_item_falls_through(monkeypatch):
    calls = []
    original = normalize_batch_module.normalize_material

    def _spy(raw_name, raw_unit, candidates, raw_brand=None):
        calls.append(raw_name)
        return original(raw_name, raw_unit, candidates, raw_brand=raw_brand)

    monkeypatch.setattr(normalize_batch_module, "normalize_material", _spy)

    df = pd.DataFrame([{"raw_name": "Portland Cement Type 1", "raw_unit": "bag", "raw_price": 250.0}])
    # item_code 999 no longer exists among candidates (e.g. deleted) — must not crash.
    cache_lookup = {normalize_match_key("Portland Cement Type 1", "bag"): 999}

    results = normalize_pricelist(df, CACHE_TEST_CANDIDATES, cache_lookup=cache_lookup)

    assert calls == ["Portland Cement Type 1"]
    assert len(results) == 1
