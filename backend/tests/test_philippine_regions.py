from app.services.philippine_regions import infer_region_from_location


def test_infers_region_from_city_location():
    assert infer_region_from_location("Parañaque City") == "NCR"
    assert infer_region_from_location("Las Piñas City") == "NCR"
    assert infer_region_from_location("Dumaguete City") == "NIR"
    assert infer_region_from_location("Bacolod City") == "Region VI"


def test_returns_none_for_unknown_location():
    assert infer_region_from_location("Unknown District Office") is None
    assert infer_region_from_location(None) is None


def test_infers_region_from_dpwh_deo_province_location():
    assert infer_region_from_location("Negros Occidental 1st DEO") == "Region VI"
    assert infer_region_from_location("Negros Occidental 4th District Engineering Office") == "Region VI"
