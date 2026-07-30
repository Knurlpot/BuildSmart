from app.services.normalizer import normalize_material


def test_normalize_material_marks_row_for_review_when_catalog_is_empty():
    result = normalize_material("Portland Cement Type I 40kg", "bag", [])

    assert result.matched_item_code is None
    assert result.confidence == 0.0
    assert result.category_type == "Concrete & Masonry"
    assert result.item_name == "Portland Cement Type I 40kg"
    assert result.unit == "bag"
    assert result.is_new_item is True


def test_normalize_material_uses_others_for_unknown_empty_catalog_item():
    result = normalize_material("Custom Supplier Misc Item", "piece", [])

    assert result.confidence == 0.0
    assert result.category_type == "Others"
    assert result.is_new_item is True


def test_normalize_material_detects_new_item_category_independent_of_closest_candidate():
    candidates = [
        {
            "item_code": 101,
            "category_type": "Structural",
            "item_name": "Portland Cement Type 1",
            "material": "Cement",
            "brand": "Holcim",
            "unit": "bag",
        }
    ]

    result = normalize_material("Vinyl Floor Tile 300x300", "box", candidates)

    assert result.is_new_item is True
    assert result.category_type == "Flooring & Tiles"
    assert result.material == "Vinyl Floor Tile 300x300"
