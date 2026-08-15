from app.schemas.blueprint import BlueprintExtractionResult, BlueprintFloor, ExtractedSegment
from app.services.blueprint_geometry_validator import validate_extraction_geometry


def result_with(coords, area_sqm=20):
    return BlueprintExtractionResult(
        floors=[
            BlueprintFloor(
                floor_level="Ground Floor",
                image_url="data:test",
                image_width=100,
                image_height=100,
                segments=[
                    ExtractedSegment(
                        segment_name="Room",
                        area_sqm=area_sqm,
                        polygon_coords=coords,
                        confidence_score=95,
                    )
                ],
            )
        ]
    )


def test_valid_polygon_passes_geometry_validation_cleanly():
    validated = validate_extraction_geometry(result_with([(10, 10), (40, 10), (40, 40), (10, 40)]))
    segment = validated.floors[0].segments[0]
    assert segment.geometry_flagged is False
    assert segment.geometry_warnings == []
    assert segment.confidence_score == 95


def test_self_intersecting_polygon_is_flagged_without_being_discarded():
    validated = validate_extraction_geometry(result_with([(10, 10), (40, 40), (10, 40), (40, 10)]))
    segment = validated.floors[0].segments[0]
    assert segment.geometry_flagged is True
    assert any("Invalid polygon" in warning for warning in segment.geometry_warnings)
    assert len(validated.floors[0].segments) == 1


def test_implausible_reported_area_is_flagged():
    validated = validate_extraction_geometry(result_with([(10, 10), (40, 10), (40, 40), (10, 40)], area_sqm=400))
    segment = validated.floors[0].segments[0]
    assert segment.geometry_flagged is True
    assert any("over 200 sqm" in warning for warning in segment.geometry_warnings)


def test_polygon_outside_page_bounds_is_flagged():
    validated = validate_extraction_geometry(result_with([(-5, 10), (40, 10), (40, 40), (10, 40)]))
    assert any("outside" in warning for warning in validated.floors[0].segments[0].geometry_warnings)


def test_non_finite_polygon_is_flagged_without_aborting_extraction():
    validated = validate_extraction_geometry(result_with([(10, 10), (float("nan"), 20), (40, 40)]))
    segment = validated.floors[0].segments[0]
    assert segment.geometry_flagged is True
    assert any("invalid coordinates" in warning for warning in segment.geometry_warnings)
