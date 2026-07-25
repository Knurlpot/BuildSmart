from app.services.normalizer import normalize_material


def test_normalize_material_marks_row_for_review_when_catalog_is_empty():
    result = normalize_material("Portland Cement Type I 40kg", "bag", [], use_mock=True)

    assert result.matched_item_code is None
    assert result.confidence == 0.0
    assert result.category_type == "Concrete & Masonry"
    assert result.item_name == "Portland Cement Type I 40kg"
    assert result.unit == "bag"
    assert result.is_new_item is True


def test_normalize_material_keeps_uncategorized_for_unknown_empty_catalog_item():
    result = normalize_material("Custom Supplier Misc Item", "piece", [], use_mock=True)

    assert result.confidence == 0.0
    assert result.category_type == "Uncategorized"
    assert result.is_new_item is True
