from app.services.normalizer_mock import ItemCandidate, normalize_material_mock

CANDIDATES: list[ItemCandidate] = [
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
    result = normalize_material_mock("Portland Cement Type I", "bag", CANDIDATES)

    assert result.is_new_item is False
    assert result.matched_item_code == 101
    assert result.confidence >= 0.6


def test_matches_despite_unit_abbreviation():
    result = normalize_material_mock("Deformed Steel Bar 10 mm", "pc", CANDIDATES)

    assert result.is_new_item is False
    assert result.matched_item_code == 102


def test_flags_new_item_when_no_close_candidate():
    result = normalize_material_mock("Vinyl Floor Tile 300x300", "box", CANDIDATES)

    assert result.is_new_item is True
    assert result.matched_item_code is None
    assert result.item_name == "Vinyl Floor Tile 300x300"
    assert result.confidence < 0.6
