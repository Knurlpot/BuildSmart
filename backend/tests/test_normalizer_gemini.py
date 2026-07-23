import pytest

from app.services.normalizer_gemini import normalize_material_gemini

# Real API calls, real money — kept to 3 cases, excluded from routine `pytest`
# runs by pytest.ini's addopts. Run explicitly with `pytest -m gemini_live`.
pytestmark = pytest.mark.gemini_live

CANDIDATES = [
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
    {
        "item_code": 103,
        "category_type": "Finishing",
        "item_name": "Latex Paint White",
        "material": "Paint",
        "brand": "Boysen",
        "unit": "gallon",
    },
]


def test_matches_close_name_and_unit():
    result = normalize_material_gemini("Portland Cement Type I", "bag", CANDIDATES)

    assert result.is_new_item is False
    assert result.matched_item_code == 101
    assert result.confidence >= 0.6


def test_matches_despite_unit_abbreviation():
    result = normalize_material_gemini("Deformed Steel Bar 10 mm", "pc", CANDIDATES)

    assert result.is_new_item is False
    assert result.matched_item_code == 102


def test_flags_new_item_when_no_close_candidate():
    result = normalize_material_gemini("Vinyl Floor Tile 300x300", "box", CANDIDATES)

    assert result.is_new_item is True
    assert result.matched_item_code is None
