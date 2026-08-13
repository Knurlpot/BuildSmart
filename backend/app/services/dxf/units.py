from .labels import extract_dimension_only, extract_room_dimension
from .schemas import TextLabel


UNIT_FACTORS_TO_METERS = {
    1: 0.0254,     # inches
    2: 0.3048,     # feet
    4: 0.001,      # millimetres
    5: 0.01,       # centimetres
    6: 1.0,        # metres
}


def unit_factor_to_meters(insunits: int) -> tuple[float, str, float, str | None]:
    if insunits in UNIT_FACTORS_TO_METERS:
        names = {1: "inches", 2: "feet", 4: "millimeters", 5: "centimeters", 6: "meters"}
        return UNIT_FACTORS_TO_METERS[insunits], names[insunits], 0.98, None
    return 1.0, "meters", 0.35, "DXF units are missing or unsupported; defaulted to meters."


def infer_unit_factor(insunits: int, drawing_bounds: tuple[float, float, float, float], labels: list[TextLabel]) -> tuple[float, str, float, list[str]]:
    factor, name, confidence, warning = unit_factor_to_meters(insunits)
    warnings = [warning] if warning else []
    drawing_span = max(drawing_bounds[2] - drawing_bounds[0], drawing_bounds[3] - drawing_bounds[1], 1)
    has_metric_dimensions = any(extract_room_dimension(label.text) or extract_dimension_only(label.text) for label in labels)

    # Some exported architectural DXFs incorrectly declare inches while coordinates and
    # printed dimensions are already metric. Preserve the old app behavior, but make it
    # explicit and diagnosable rather than silent.
    if insunits == 1 and drawing_span < 1000 and has_metric_dimensions:
        return 1.0, "meters", 0.72, ["DXF declares inches but metric room dimensions were detected; treated drawing units as meters."]

    return factor, name, confidence, warnings

