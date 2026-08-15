import base64
import html
import io
import math
import os
import re
import tempfile
from pathlib import Path
from typing import Any, NamedTuple
from urllib.parse import quote

from tenacity import retry, stop_after_attempt, wait_exponential

from app.schemas.blueprint import (
    BlueprintExtractionResult,
    BlueprintFloor,
    ExtractedSegment,
    GeminiFloorExtraction,
)
from app.services.blueprint_geometry_validator import validate_extraction_geometry

MAX_BLUEPRINT_BYTES = 25 * 1024 * 1024
GEMINI_MODEL = os.environ.get("GEMINI_VISION_MODEL", os.environ.get("GEMINI_MODEL", "gemini-flash-latest"))


def _data_url(content: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _png_bytes(image: Any) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=10))
def _extract_pdf_page_with_gemini(image_bytes: bytes, page_number: int) -> GeminiFloorExtraction:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required to scan PDF blueprints.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    prompt = (
        "Analyze this architectural blueprint page. Identify enclosed rooms or measurable construction areas. "
        "Return each segment's printed room name, area in square metres, polygon boundary in the image's pixel "
        "coordinates, and a 0-100 confidence score. Use a short floor label such as Ground Floor or Floor 2. "
        "Do not invent an area when neither dimensions nor scale support it. Exclude legends, title blocks, "
        "dimension labels, furniture, and symbols. Polygon points must follow the visible room boundary."
    )
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type="image/png")],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiFloorExtraction,
        ),
    )
    parsed = response.parsed
    if isinstance(parsed, GeminiFloorExtraction):
        return parsed
    return GeminiFloorExtraction.model_validate(parsed)


def _extract_pdf(content: bytes) -> BlueprintExtractionResult:
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        convert_from_bytes = None

    try:
        if convert_from_bytes is None:
            raise RuntimeError("pdf2image is unavailable")
        images = convert_from_bytes(content, dpi=150, fmt="png")
    except Exception:
        # pdf2image uses Poppler in production. pdfplumber provides a local fallback for
        # development environments where Poppler is not installed (notably Windows).
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(content)) as document:
                images = [page.to_image(resolution=150).original for page in document.pages]
        except Exception as exc:
            raise RuntimeError("Could not render this PDF blueprint.") from exc

    if not images:
        raise ValueError("The PDF contains no readable pages.")

    floors: list[BlueprintFloor] = []
    for index, image in enumerate(images):
        image_bytes = _png_bytes(image)
        detected = _extract_pdf_page_with_gemini(image_bytes, index + 1)
        segments = [
            ExtractedSegment(
                segment_name=segment.segment_name.strip() or f"Segment {position + 1}",
                area_sqm=round(segment.area_sqm, 2),
                polygon_coords=segment.polygon_coords,
                confidence_score=segment.confidence_score,
            )
            for position, segment in enumerate(detected.segments)
            if segment.area_sqm > 0 and len(segment.polygon_coords) >= 3
        ]
        floors.append(
            BlueprintFloor(
                floor_level=detected.floor_level.strip() or f"Page {index + 1}",
                image_url=_data_url(image_bytes, "image/png"),
                image_width=image.width,
                image_height=image.height,
                segments=segments,
            )
        )
    return BlueprintExtractionResult(floors=floors)


def _unit_to_metres(insunits: int) -> float:
    return {
        1: 0.0254,  # inches
        2: 0.3048,  # feet
        4: 0.001,   # millimetres
        5: 0.01,    # centimetres
        6: 1.0,     # metres
    }.get(insunits, 1.0)


def _dxf_units_to_metres(insunits: int, drawing_bounds: tuple[float, float, float, float], labels: list["DxfTextLabel"]) -> float:
    factor = _unit_to_metres(insunits)
    drawing_span = max(drawing_bounds[2] - drawing_bounds[0], drawing_bounds[3] - drawing_bounds[1], 1)
    has_metric_room_dimensions = any(_extract_room_dimension(label.text) or _extract_dimension_only(label.text) for label in labels)
    if insunits == 1 and drawing_span < 1000 and has_metric_room_dimensions:
        return 1.0
    return factor


class DxfTextLabel(NamedTuple):
    text: str
    point: Any


class DxfFloorRegion(NamedTuple):
    name: str
    bounds: tuple[float, float, float, float]


FLOOR_LABEL_RE = re.compile(
    r"\b("
    r"basement|lower\s+ground|ground|first|second|third|fourth|fifth|sixth|"
    r"\d+(?:st|nd|rd|th)?"
    r")\s+floor(?:\s+plan)?\b",
    re.IGNORECASE,
)
ROOM_DIMENSION_RE = re.compile(
    r"(?P<name>[A-Z][A-Z0-9 &./'-]{1,60}?)\s+"
    r"(?P<length>\d+(?:\.\d+)?)\s*[xX]\s*(?P<width>\d+(?:\.\d+)?)"
    r"(?:\s*(?:M|METERS?|MM))?\b",
    re.IGNORECASE,
)
DIMENSION_ONLY_RE = re.compile(
    r"^\s*(?P<length>\d+(?:\.\d+)?)\s*[xX]\s*(?P<width>\d+(?:\.\d+)?)(?:\s*(?:M|METERS?|MM))?\s*$",
    re.IGNORECASE,
)
ROOM_NAME_RE = re.compile(r"^[A-Z][A-Z0-9 &./'-]{1,60}$", re.IGNORECASE)
SPACE_KEYWORDS = {
    "bath",
    "bathroom",
    "bed",
    "bedroom",
    "bed/lounge",
    "beauty",
    "barber",
    "corridor",
    "comfort",
    "cr",
    "entrance",
    "facility",
    "facilities",
    "garage",
    "g.store",
    "kitchen",
    "living",
    "lobby",
    "lounge",
    "office",
    "parlor",
    "reception",
    "room",
    "shop",
    "shr",
    "store",
    "toilet",
    "void",
    "waiting",
    "wc",
}
NON_SPACE_LABELS = {
    "balcony",
    "dn",
    "down",
    "drs",
    "duct",
    "dress",
    "drawing",
    "el",
    "elev",
    "elevator",
    "n",
    "proposal",
    "project",
    "scale",
    "slope",
    "up",
}


def _clean_dxf_text(text: str) -> str:
    cleaned = text.replace("\\P", " ").replace("\\X", " ")
    cleaned = re.sub(r"{\\[^;]+;", "", cleaned).replace("}", "")
    return re.sub(r"\s+", " ", cleaned).strip()


def _normalize_floor_label(text: str) -> str | None:
    cleaned = _clean_dxf_text(text)
    match = FLOOR_LABEL_RE.search(cleaned)
    if not match:
        return None
    raw = match.group(0)
    words = [word.upper() if word.isdigit() else word.capitalize() for word in raw.split()]
    return " ".join(words).replace("Floor Plan", "Floor").replace("Floor", "Floor Plan", 1)


def _extract_room_dimension(text: str) -> tuple[str, float, float] | None:
    if _normalize_floor_label(text):
        return None
    cleaned = _clean_dxf_text(text)
    match = ROOM_DIMENSION_RE.search(cleaned)
    if not match:
        return None
    name = re.sub(r"\s+", " ", match.group("name")).strip(" -:").title()
    length = float(match.group("length"))
    width = float(match.group("width"))
    if not name or length <= 0 or width <= 0:
        return None
    return (name, length, width)


def _extract_dimension_only(text: str) -> tuple[float, float] | None:
    match = DIMENSION_ONLY_RE.match(_clean_dxf_text(text))
    if not match:
        return None
    length = float(match.group("length"))
    width = float(match.group("width"))
    if length <= 0 or width <= 0:
        return None
    return (length, width)


def _space_label_name(text: str) -> str | None:
    cleaned = _clean_dxf_text(text)
    if _normalize_floor_label(cleaned):
        return None
    dimension_room = _extract_room_dimension(cleaned)
    if dimension_room:
        return dimension_room[0]
    cleaned = re.sub(r"\b\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?)?\s*(?:wide|m|meters?|mm)?\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:").title()
    if not cleaned:
        return None
    canonical = _canonical_segment_name(cleaned)
    if canonical in NON_SPACE_LABELS:
        return None
    words = set(re.split(r"[\s/&.-]+", canonical))
    if canonical not in SPACE_KEYWORDS and words.isdisjoint(SPACE_KEYWORDS):
        return None
    return cleaned


def _is_room_name_label(text: str) -> bool:
    cleaned = _space_label_name(text)
    if not cleaned or not ROOM_NAME_RE.match(cleaned):
        return False
    return True


def _entity_bounds(entity: Any) -> tuple[float, float, float, float] | None:
    try:
        if entity.dxftype() == "LINE":
            start, end = entity.dxf.start, entity.dxf.end
            xs = [float(start.x), float(end.x)]
            ys = [float(start.y), float(end.y)]
            return (min(xs), min(ys), max(xs), max(ys))
        if entity.dxftype() == "LWPOLYLINE":
            points = [(float(point[0]), float(point[1])) for point in entity.get_points("xy")]
        elif entity.dxftype() == "POLYLINE":
            points = [(float(vertex.dxf.location.x), float(vertex.dxf.location.y)) for vertex in entity.vertices]
        elif entity.dxftype() in {"TEXT", "MTEXT"}:
            insert = entity.dxf.insert
            return (float(insert.x), float(insert.y), float(insert.x), float(insert.y))
        else:
            return None
    except Exception:
        return None
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return (min(xs), min(ys), max(xs), max(ys))


def _bounds_center(bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    return ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)


def _expanded(bounds: tuple[float, float, float, float], padding: float) -> tuple[float, float, float, float]:
    return (bounds[0] - padding, bounds[1] - padding, bounds[2] + padding, bounds[3] + padding)


def _contains_point(bounds: tuple[float, float, float, float], point: tuple[float, float]) -> bool:
    return bounds[0] <= point[0] <= bounds[2] and bounds[1] <= point[1] <= bounds[3]


def _bounds_area(bounds: tuple[float, float, float, float]) -> float:
    return max(bounds[2] - bounds[0], 0) * max(bounds[3] - bounds[1], 0)


def _bounds_intersect(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def _union_bounds(bounds: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    return (
        min(bound[0] for bound in bounds),
        min(bound[1] for bound in bounds),
        max(bound[2] for bound in bounds),
        max(bound[3] for bound in bounds),
    )


def _canonical_segment_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def _close_linework_gaps(linework: list[Any], drawing_span: float) -> list[Any]:
    from shapely.geometry import LineString

    max_gap = min(max(drawing_span * 0.014, 0.45), 1.35)
    alignment_tolerance = min(max(drawing_span * 0.002, 0.08), 0.18)
    endpoints: list[tuple[float, float]] = []
    for line in linework:
        coords = list(line.coords)
        if len(coords) >= 2:
            endpoints.append((float(coords[0][0]), float(coords[0][1])))
            endpoints.append((float(coords[-1][0]), float(coords[-1][1])))

    candidates: list[tuple[float, tuple[float, float], tuple[float, float]]] = []
    for index, start in enumerate(endpoints):
        for end in endpoints[index + 1 :]:
            dx = abs(start[0] - end[0])
            dy = abs(start[1] - end[1])
            distance = math.hypot(dx, dy)
            if distance <= 0.05 or distance > max_gap:
                continue
            if min(dx, dy) > alignment_tolerance:
                continue
            candidates.append((distance, start, end))

    closed: list[Any] = list(linework)
    used: set[tuple[float, float]] = set()
    for _, start, end in sorted(candidates, key=lambda item: item[0]):
        if start in used or end in used:
            continue
        closed.append(LineString([start, end]))
        used.add(start)
        used.add(end)
    return closed


def _floor_regions_from_labels(labels: list[DxfTextLabel], drawing_bounds: tuple[float, float, float, float]) -> list[DxfFloorRegion]:
    floor_labels = [(label, _normalize_floor_label(label.text)) for label in labels]
    floor_labels = [(label, name) for label, name in floor_labels if name]
    if not floor_labels:
        return [DxfFloorRegion("Floor Plan", drawing_bounds)]

    xs = sorted({float(label.point.x) for label, _ in floor_labels})
    ys = sorted({float(label.point.y) for label, _ in floor_labels})

    def bands(values: list[float], low: float, high: float) -> list[tuple[float, float]]:
        if len(values) <= 1:
            return [(low, high)]
        mids = [(values[index] + values[index + 1]) / 2 for index in range(len(values) - 1)]
        return [(low, mids[0]), *[(mids[index - 1], mids[index]) for index in range(1, len(mids))], (mids[-1], high)]

    x_bands = bands(xs, drawing_bounds[0], drawing_bounds[2])
    y_bands = bands(ys, drawing_bounds[1], drawing_bounds[3])
    regions: list[DxfFloorRegion] = []
    seen: set[str] = set()
    for label, name in floor_labels:
        assert name is not None
        x = float(label.point.x)
        y = float(label.point.y)
        x_band = next((band for band in x_bands if band[0] <= x <= band[1]), (drawing_bounds[0], drawing_bounds[2]))
        y_band = next((band for band in y_bands if band[0] <= y <= band[1]), (drawing_bounds[1], drawing_bounds[3]))
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        regions.append(DxfFloorRegion(name, (x_band[0], y_band[0], x_band[1], y_band[1])))
    return regions or [DxfFloorRegion("Floor Plan", drawing_bounds)]


def _floor_regions_from_geometry(
    entity_bounds: list[tuple[Any, tuple[float, float, float, float]]],
    labels: list[DxfTextLabel],
    drawing_bounds: tuple[float, float, float, float],
) -> list[DxfFloorRegion]:
    drawing_area = max(_bounds_area(drawing_bounds), 1)
    drawing_span = max(drawing_bounds[2] - drawing_bounds[0], drawing_bounds[3] - drawing_bounds[1], 1)
    merge_padding = drawing_span * 0.012
    min_component_area = drawing_area * 0.01

    candidates = [
        bounds
        for entity, bounds in entity_bounds
        if entity.dxftype() not in {"TEXT", "MTEXT"} and 0 < _bounds_area(bounds) < drawing_area * 0.72
    ]
    components: list[list[tuple[float, float, float, float]]] = []
    for bounds in candidates:
        expanded = _expanded(bounds, merge_padding)
        matched: list[int] = []
        for index, component in enumerate(components):
            if any(_bounds_intersect(expanded, _expanded(existing, merge_padding)) for existing in component):
                matched.append(index)
        if not matched:
            components.append([bounds])
            continue
        first = matched[0]
        components[first].append(bounds)
        for index in reversed(matched[1:]):
            components[first].extend(components.pop(index))

    component_bounds = [_union_bounds(component) for component in components]
    component_bounds = [bounds for bounds in component_bounds if _bounds_area(bounds) >= min_component_area]
    if len(component_bounds) < 2:
        return []

    floor_labels = [(label, _normalize_floor_label(label.text)) for label in labels]
    floor_labels = [(label, name) for label, name in floor_labels if name]

    def label_for(bounds: tuple[float, float, float, float], index: int) -> str:
        expanded = _expanded(bounds, drawing_span * 0.08)
        nearby = [(label, name) for label, name in floor_labels if _contains_point(expanded, (float(label.point.x), float(label.point.y)))]
        if nearby:
            nearby.sort(key=lambda item: abs(float(item[0].point.x) - _bounds_center(bounds)[0]) + abs(float(item[0].point.y) - bounds[1]))
            return nearby[0][1] or f"Floor Plan {index + 1}"
        return f"Floor Plan {index + 1}"

    sorted_bounds = sorted(component_bounds, key=lambda bounds: (-_bounds_center(bounds)[1], _bounds_center(bounds)[0]))
    regions = [DxfFloorRegion(label_for(bounds, index), bounds) for index, bounds in enumerate(sorted_bounds)]
    seen: dict[str, int] = {}
    deduped: list[DxfFloorRegion] = []
    for region in regions:
        count = seen.get(region.name, 0) + 1
        seen[region.name] = count
        name = region.name if count == 1 else f"{region.name} {count}"
        deduped.append(DxfFloorRegion(name, region.bounds))
    return deduped


def _extract_dxf(content: bytes) -> BlueprintExtractionResult:
    try:
        from app.services.dxf.extractor import extract_dxf_blueprint
    except ImportError as exc:
        raise RuntimeError("DXF support requires ezdxf and Shapely.") from exc

    return extract_dxf_blueprint(content)


def extract_blueprint(filename: str, content: bytes) -> BlueprintExtractionResult:
    if not content:
        raise ValueError("The uploaded blueprint is empty.")
    if len(content) > MAX_BLUEPRINT_BYTES:
        raise ValueError("Blueprint files must be 25 MB or smaller.")

    extension = Path(filename).suffix.lower()
    if extension == ".pdf":
        result = _extract_pdf(content)
        return validate_extraction_geometry(result)
    if extension == ".dxf":
        result = _extract_dxf(content)
        return validate_extraction_geometry(result)
    raise ValueError("Upload a PDF or DXF blueprint.")
