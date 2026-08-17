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
    BlueprintConfidenceBuckets,
    BlueprintExtractionResult,
    BlueprintFloor,
    BlueprintLegendItem,
    ExtractedSegment,
    GeminiFloorExtraction,
    RoomOverlay,
)
from app.services.blueprint_geometry_validator import validate_extraction_geometry

MAX_BLUEPRINT_BYTES = 25 * 1024 * 1024
GEMINI_MODEL = os.environ.get("GEMINI_VISION_MODEL", os.environ.get("GEMINI_MODEL", "gemini-1.5-flash"))


def _confidence_buckets_for_segments(segments: list[ExtractedSegment]) -> BlueprintConfidenceBuckets:
    return BlueprintConfidenceBuckets(
        high_confidence=[segment for segment in segments if segment.confidence_score is not None and segment.confidence_score >= 85],
        medium_confidence=[segment for segment in segments if segment.confidence_score is not None and 60 <= segment.confidence_score < 85],
        low_confidence=[segment for segment in segments if segment.confidence_score is not None and segment.confidence_score < 60],
        uncertain=[segment for segment in segments if segment.confidence_score is None],
    )


def _floor_with_review_metadata(floor: BlueprintFloor) -> BlueprintFloor:
    buckets = _confidence_buckets_for_segments(floor.segments)
    return floor.model_copy(
        update={
            "confidence_buckets": buckets,
            "review_required": bool(buckets.medium_confidence or buckets.low_confidence or buckets.uncertain),
        }
    )


def _with_review_metadata(result: BlueprintExtractionResult) -> BlueprintExtractionResult:
    return result.model_copy(update={"floors": [_floor_with_review_metadata(floor) for floor in result.floors]})


def _data_url(content: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _png_bytes(image: Any) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


GEMINI_BLUEPRINT_SEGMENTATION_PROMPT = """
You are an advanced architectural vision AI. Analyze the provided floor plan image, isolate a SINGLE floor plan viewport, and detect 100% of all distinct spatial zones, including rooms, central hallways, corridors, stairwells, balconies, and unlabelled utility spaces.

MANDATORY SCANNING RULES:
1. 100% FLOOR COVERAGE (NO SKIPPED PASSAGES):
- Identify all circulation spaces, central corridors, entrance foyers, and stairwell lobbies.
- Do not limit detection only to named rooms. Open passageways must be scanned and categorized as Circulation & Hallways.

2. SINGLE FLOOR FOCUS:
- Focus spatial bounding boxes strictly on the active floor layout.
- Ignore outer title blocks, surrounding floor plans, legends, margin dimensions, furniture, and symbols.

3. BOUNDING BOX PRECISION:
- Provide normalized 2D bounding box coordinates on a 0-1000 scale as [ymin, xmin, ymax, xmax].

CATEGORIZATION & COLOR MATRIX:
- Living Areas: Living, Dining, Family Room, Lounge. Color #80B3FF.
- Bedrooms / Suites: Bedroom, Suite, BR, Sleeping Area. Color #FFB3BA.
- Kitchen & Dining: Kitchen, Pantry, Nook, Bar. Color #FFCC80.
- Bathrooms & Services: Bathroom, WC, Toilet, Laundry, Service. Color #A8E6CF.
- Commercial & Storage: Shop, Storefront, Commercial Bay, Storage. Color #4ECDC4.
- Circulation & Hallways: Corridor, Hallway, Foyer, Passageway, Stairs, Elevators. Color #9B59B6.
- Balconies & Porches: Balcony, Porch, Deck, Veranda, Slope, Ramp. Color #E8A0BF.
- Unassigned Utility: Unlabelled rooms, enclosed utility bays, unassigned spaces. Color #7F8C8D.

Return only a valid JSON object matching this schema:
{
  "floor_name": "Floor Plan 1",
  "total_detected_spaces": 18,
  "detected_spaces": [
    {
      "id": "space_1",
      "name": "SHOP 1",
      "category": "Commercial & Storage",
      "color_hex": "#4ECDC4",
      "bounding_box_1000": [150, 200, 350, 450],
      "confidence_score": 0.95
    }
  ]
}
""".strip()


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=10))
def _extract_pdf_page_with_gemini(image_bytes: bytes, page_number: int) -> GeminiFloorExtraction:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required to scan PDF blueprints.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[GEMINI_BLUEPRINT_SEGMENTATION_PROMPT, types.Part.from_bytes(data=image_bytes, mime_type="image/png")],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiFloorExtraction,
        ),
    )
    parsed = response.parsed
    if isinstance(parsed, GeminiFloorExtraction):
        return parsed
    return GeminiFloorExtraction.model_validate(parsed)


def _bbox_1000_to_polygon(
    bbox: tuple[float, float, float, float],
    image_width: int,
    image_height: int,
) -> list[tuple[float, float]]:
    ymin, xmin, ymax, xmax = bbox
    clamped_ymin = min(max(ymin, 0), 1000)
    clamped_xmin = min(max(xmin, 0), 1000)
    clamped_ymax = min(max(ymax, 0), 1000)
    clamped_xmax = min(max(xmax, 0), 1000)
    x0 = round((min(clamped_xmin, clamped_xmax) / 1000) * image_width, 2)
    x1 = round((max(clamped_xmin, clamped_xmax) / 1000) * image_width, 2)
    y0 = round((min(clamped_ymin, clamped_ymax) / 1000) * image_height, 2)
    y1 = round((max(clamped_ymin, clamped_ymax) / 1000) * image_height, 2)
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def _segment_from_gemini_space(space: Any, floor_index: int, segment_index: int, image_width: int, image_height: int) -> ExtractedSegment:
    polygon = _bbox_1000_to_polygon(space.bounding_box_1000, image_width, image_height)
    width_px = max(polygon[1][0] - polygon[0][0], 1)
    height_px = max(polygon[2][1] - polygon[1][1], 1)
    alpha = 0.35
    return ExtractedSegment(
        segment_id=space.id or f"segment_f{floor_index}_{segment_index:02d}",
        segment_name=space.name[:150],
        area_sqm=round((width_px * height_px) / 10000, 2),
        perimeter_m=round((width_px + height_px) * 2 / 100, 2),
        category=space.category,
        color_hex=space.color_hex,
        alpha=alpha,
        overlay=RoomOverlay(category=space.category, color_hex=space.color_hex, alpha=alpha, rgba=_rgba(space.color_hex, alpha)),
        polygon_coords=polygon,
        confidence_score=round(space.confidence_score * 100, 2),
        status="INCLUDED",
    )


def _extract_pdf(content: bytes) -> BlueprintExtractionResult:
    vector_result = _extract_vector_pdf(content)
    if vector_result is not None:
        return _with_review_metadata(vector_result)
    return _with_review_metadata(_extract_scanned_pdf_preview(content))


def _extract_scanned_pdf_preview(content: bytes) -> BlueprintExtractionResult:
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
    gemini_enabled = bool(os.environ.get("GEMINI_API_KEY"))
    for index, image in enumerate(images):
        image_bytes = _png_bytes(image)
        image_url = _data_url(image_bytes, "image/png")
        floor_name = f"Page {index + 1}"
        segments: list[ExtractedSegment] = []
        if gemini_enabled:
            extraction = _extract_pdf_page_with_gemini(image_bytes, index + 1)
            floor_name = extraction.floor_name or floor_name
            segments = [
                _segment_from_gemini_space(space, index + 1, segment_index, image.width, image.height)
                for segment_index, space in enumerate(extraction.detected_spaces, start=1)
            ]
        floors.append(
            BlueprintFloor(
                floor_id=index + 1,
                floor_level=floor_name,
                floor_name=floor_name,
                image_url=image_url,
                image_width=image.width,
                image_height=image.height,
                viewport_bbox=(0, 0, image.width, image.height),
                segments=segments,
                legend=_legend(segments),
                visual_preview_url=image_url,
            )
        )
    if gemini_enabled:
        return BlueprintExtractionResult(
            floors=floors,
            diagnostics={
                "source": "gemini_vision",
                "warnings": [
                    "Scanned PDF spaces were detected by Gemini Vision and require human review before quotation."
                ],
            },
            structured_json={
                "floors": [
                    {
                        "floor_name": floor.floor_name or floor.floor_level,
                        "total_detected_spaces": len(floor.segments),
                        "detected_spaces": [
                            {
                                "id": segment.segment_id,
                                "name": segment.segment_name,
                                "category": segment.category,
                                "color_hex": segment.color_hex,
                                "confidence_score": round((segment.confidence_score or 0) / 100, 2),
                            }
                            for segment in floor.segments
                        ],
                    }
                    for floor in floors
                ]
            },
        )
    return BlueprintExtractionResult(
        floors=floors,
        diagnostics={
            "warnings": [
                "PDF contains no deterministic vector room geometry; returned per-page scanned previews without room polygons."
            ]
        },
        structured_json={"floors": [{"floor_level": floor.floor_level, "rooms": [], "legend": []} for floor in floors]},
    )


def _pdf_category_for(name: str, aspect_ratio: float, labeled: bool) -> tuple[str, str, float]:
    lowered = re.sub(r"\s+", " ", name).strip().lower()
    if any(keyword in lowered for keyword in ("hall", "corridor", "passage", "stair", "stairs", "entrance")) or aspect_ratio >= 3.0:
        return ("Circulation & Hallways", "#9B59B6", 0.35)
    if not labeled:
        return ("Unassigned Utility / Room", "#7F8C8D", 0.35)
    matrix = (
        ("Master Suite", ("master", "master bed", "master bath"), "#A8DADC", 0.35),
        ("Living Areas", ("living", "dining", "family", "great room"), "#80B3FF", 0.35),
        ("Bedrooms / Suites", ("bed", "br", "bedroom", "suite"), "#FFB3BA", 0.35),
        ("Kitchen & Dining", ("kitchen", "pantry", "nook", "bar"), "#FFCC80", 0.35),
        ("Bathrooms & Services", ("bath", "wc", "powder", "toilet", "utility", "laundry"), "#A8E6CF", 0.35),
        ("Commercial & Storage", ("shop", "store", "commercial", "storage"), "#4ECDC4", 0.35),
        ("Balconies & Porches", ("porch", "veranda", "balcony", "deck"), "#E8A0BF", 0.35),
        ("Circulation & Hallways", ("hall", "corridor", "passage", "stair", "stairs", "entrance"), "#9B59B6", 0.35),
    )
    for category, keywords, color_hex, alpha in matrix:
        if any(re.search(rf"\b{re.escape(keyword)}\b", lowered) for keyword in keywords):
            return (category, color_hex, alpha)
    return ("Unassigned Utility / Room", "#7F8C8D", 0.35)


def _rgba(color_hex: str, alpha: float) -> tuple[int, int, int, float]:
    return (int(color_hex[1:3], 16), int(color_hex[3:5], 16), int(color_hex[5:7], 16), alpha)


def _legend(segments: list[ExtractedSegment]) -> list[BlueprintLegendItem]:
    totals: dict[str, tuple[str, float, float]] = {}
    for segment in segments:
        if not segment.category or not segment.color_hex or segment.alpha is None:
            continue
        color_hex, alpha, area = totals.get(segment.category, (segment.color_hex, segment.alpha, 0))
        totals[segment.category] = (color_hex, alpha, area + segment.area_sqm)
    return [
        BlueprintLegendItem(category=category, color_hex=color_hex, alpha=alpha, total_area_sqm=round(area, 2))
        for category, (color_hex, alpha, area) in totals.items()
    ]


def _with_hybrid_structured_json(filename: str, result: BlueprintExtractionResult) -> BlueprintExtractionResult:
    floors_payload = []
    total_area = 0.0
    for floor_index, floor in enumerate(result.floors, start=1):
        floor_id = floor.floor_id or floor_index
        floor_name = floor.floor_name or floor.floor_level
        floor_area = round(sum(segment.area_sqm for segment in floor.segments if segment.status == "INCLUDED"), 2)
        total_area += floor_area
        rooms = []
        for segment_index, segment in enumerate(floor.segments, start=1):
            room_id = segment.segment_id or f"segment_f{floor_id}_{segment_index:02d}"
            rooms.append(
                {
                    "id": room_id,
                    "name": segment.segment_name,
                    "category": segment.category,
                    "area_sqm": segment.area_sqm,
                    "perimeter_m": segment.perimeter_m,
                    "color_hex": segment.color_hex,
                    "confidence_score": round((segment.confidence_score or 0) / 100, 2),
                    "status": segment.status,
                }
            )
        confidence_buckets = {
            "high_confidence": [segment.segment_id for segment in floor.confidence_buckets.high_confidence],
            "medium_confidence": [segment.segment_id for segment in floor.confidence_buckets.medium_confidence],
            "low_confidence": [segment.segment_id for segment in floor.confidence_buckets.low_confidence],
            "uncertain": [segment.segment_id for segment in floor.confidence_buckets.uncertain],
        }
        floors_payload.append(
            {
                "floor_id": floor_id,
                "floor_name": floor_name,
                "viewport_bbox": floor.viewport_bbox,
                "floor_area_sqm": floor_area,
                "total_segments": len(floor.segments),
                "total_segments_count": len(floor.segments),
                "segments": rooms,
                "rooms": rooms,
                "confidence_buckets": confidence_buckets,
                "review_required": floor.review_required,
            }
        )
    result.structured_json = {
        "file_name": filename,
        "total_floors_detected": len(result.floors),
        "active_floor_id": result.floors[0].floor_id if result.floors else None,
        "total_building_area_sqm": round(total_area, 2),
        "active_tab": result.floors[0].floor_level if result.floors else None,
        "floors_count": len(result.floors),
        "floors": floors_payload,
    }
    return result


def _extract_vector_pdf(content: bytes) -> BlueprintExtractionResult | None:
    try:
        import pdfplumber
        from shapely.geometry import LineString, Point
        from shapely.ops import polygonize, unary_union
    except Exception:
        return None

    floors: list[BlueprintFloor] = []
    try:
        document_ctx = pdfplumber.open(io.BytesIO(content))
    except Exception:
        return None

    with document_ctx as document:
        for page_index, page in enumerate(document.pages, start=1):
            lines: list[LineString] = []
            for line in page.lines:
                lines.append(LineString([(float(line["x0"]), float(line["top"])), (float(line["x1"]), float(line["bottom"]))]))
            for rect in page.rects:
                x0, x1, top, bottom = float(rect["x0"]), float(rect["x1"]), float(rect["top"]), float(rect["bottom"])
                coords = [(x0, top), (x1, top), (x1, bottom), (x0, bottom), (x0, top)]
                lines.extend(LineString([coords[i], coords[i + 1]]) for i in range(4))
            if not lines:
                continue
            words = page.extract_words() or []
            labels = [
                (str(word.get("text", "")).strip(), Point((float(word["x0"]) + float(word["x1"])) / 2, (float(word["top"]) + float(word["bottom"])) / 2))
                for word in words
                if str(word.get("text", "")).strip()
            ]
            try:
                polygons = [polygon for polygon in polygonize(unary_union(lines)) if polygon.is_valid and polygon.area > 16]
            except Exception:
                continue
            segments: list[ExtractedSegment] = []
            unlabeled_id = 1
            for segment_index, polygon in enumerate(sorted(polygons, key=lambda item: (item.bounds[1], item.bounds[0])), start=1):
                contained = [text for text, point in labels if polygon.contains(point)]
                name = " ".join(contained[:4]).strip()
                labeled = bool(name)
                if not labeled:
                    min_x, min_y, max_x, max_y = polygon.bounds
                    ratio = max(max_x - min_x, max_y - min_y) / max(min(max_x - min_x, max_y - min_y), 0.000001)
                    name = f"UNLABELED_SPACE_{unlabeled_id}"
                    unlabeled_id += 1
                else:
                    min_x, min_y, max_x, max_y = polygon.bounds
                    ratio = max(max_x - min_x, max_y - min_y) / max(min(max_x - min_x, max_y - min_y), 0.000001)
                category, color_hex, alpha = _pdf_category_for(name, ratio, labeled)
                coords = [(round(float(x), 2), round(float(y), 2)) for x, y in list(polygon.exterior.coords)[:-1]]
                segments.append(
                    ExtractedSegment(
                        segment_id=f"segment_f{page_index}_{segment_index:02d}",
                        segment_name=name[:150],
                        area_sqm=round(polygon.area, 2),
                        perimeter_m=round(polygon.length, 2),
                        category=category,
                        color_hex=color_hex,
                        alpha=alpha,
                        overlay=RoomOverlay(category=category, color_hex=color_hex, alpha=alpha, rgba=_rgba(color_hex, alpha)),
                        polygon_coords=coords,
                        confidence_score=88 if labeled else 58,
                        status="INCLUDED",
                    )
                )
            if segments:
                legend = _legend(segments)
                width, height = int(page.width), int(page.height)
                line_svg = []
                for line in lines:
                    coords = list(line.coords)
                    line_svg.append(
                        f'<polyline points="{" ".join(f"{round(float(x), 2)},{round(float(y), 2)}" for x, y in coords)}" '
                        f'stroke="#111827" stroke-width="1" fill="none"/>'
                    )
                svg = (
                    f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
                    f'<rect width="100%" height="100%" fill="white"/>{"".join(line_svg)}</svg>'
                )
                visual_url = f"data:image/svg+xml;charset=utf-8,{quote(svg)}"
                floors.append(
                    BlueprintFloor(
                        floor_id=page_index,
                        floor_level=f"Page {page_index}",
                        floor_name=f"Page {page_index}",
                        image_url=visual_url,
                        image_width=width,
                        image_height=height,
                        viewport_bbox=(0, 0, width, height),
                        segments=segments,
                        legend=legend,
                        visual_preview_url=visual_url,
                        report_page_url=visual_url,
                    )
                )
    if not floors:
        return None
    structured_json = {
        "floors": [
            {
                "floor_level": floor.floor_level,
                "rooms": [
                    {
                        "room_name": segment.segment_name,
                        "category": segment.category,
                        "area_sqm": segment.area_sqm,
                        "perimeter_m": segment.perimeter_m,
                        "color_hex": segment.color_hex,
                        "alpha": segment.alpha,
                        "polygon_coords": segment.polygon_coords,
                    }
                    for segment in floor.segments
                ],
                "legend": [item.model_dump() for item in floor.legend],
            }
            for floor in floors
        ]
    }
    return BlueprintExtractionResult(floors=floors, structured_json=structured_json, report_url=floors[0].visual_preview_url)


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
    if extension in {".png", ".jpg", ".jpeg", ".bmp"}:
        raise ValueError("Image uploads are not supported. Upload a vector PDF or DXF blueprint.")
    if extension == ".pdf":
<<<<<<< HEAD
        result = _extract_pdf(content)
        return validate_extraction_geometry(result)
    if extension == ".dxf":
        result = _extract_dxf(content)
        return validate_extraction_geometry(result)
=======
        return _with_hybrid_structured_json(filename, _extract_pdf(content))
    if extension == ".dxf":
        return _with_hybrid_structured_json(filename, _with_review_metadata(_extract_dxf(content)))
>>>>>>> b18ef380b1ed66463eeecb56171fd0b12a1aebb8
    raise ValueError("Upload a PDF or DXF blueprint.")
