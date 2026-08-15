import math

from shapely.geometry import Polygon
from shapely.validation import explain_validity

from app.schemas.blueprint import BlueprintExtractionResult, ExtractedSegment

MIN_PLAUSIBLE_AREA_SQM = 1.0
MAX_PLAUSIBLE_AREA_SQM = 200.0
BOUNDS_TOLERANCE_PX = 1.0


def validate_segment_geometry(segment: ExtractedSegment, image_width: int, image_height: int) -> ExtractedSegment:
    warnings: list[str] = list(segment.geometry_warnings)
    coords = segment.polygon_coords or []

    if len(coords) < 3:
        warnings.append("Polygon has fewer than three points.")
    elif any(not math.isfinite(x) or not math.isfinite(y) for x, y in coords):
        warnings.append("Polygon contains invalid coordinates.")
    else:
        try:
            polygon = Polygon(coords)
            if not polygon.is_valid:
                reason = explain_validity(polygon)
                warnings.append(f"Invalid polygon: {reason}.")
            if polygon.area <= 0:
                warnings.append("Polygon has no measurable shape area.")
        except Exception:
            # Geometry review is additive. A malformed polygon must be surfaced to the
            # reviewer, never turn an otherwise successful extraction into an HTTP 500.
            warnings.append("Polygon could not be validated.")

        if any(
            x < -BOUNDS_TOLERANCE_PX
            or y < -BOUNDS_TOLERANCE_PX
            or x > image_width + BOUNDS_TOLERANCE_PX
            or y > image_height + BOUNDS_TOLERANCE_PX
            for x, y in coords
        ):
            warnings.append("Polygon extends outside the blueprint bounds.")

    if segment.area_sqm < MIN_PLAUSIBLE_AREA_SQM:
        warnings.append(f"Reported area is under {MIN_PLAUSIBLE_AREA_SQM:g} sqm.")
    elif segment.area_sqm > MAX_PLAUSIBLE_AREA_SQM:
        warnings.append(f"Reported area is over {MAX_PLAUSIBLE_AREA_SQM:g} sqm.")

    return segment.model_copy(update={"geometry_flagged": bool(warnings), "geometry_warnings": warnings})


def validate_extraction_geometry(result: BlueprintExtractionResult) -> BlueprintExtractionResult:
    floors = [
        floor.model_copy(
            update={
                "segments": [
                    validate_segment_geometry(segment, floor.image_width, floor.image_height)
                    for segment in floor.segments
                ]
            }
        )
        for floor in result.floors
    ]
    return result.model_copy(update={"floors": floors})
