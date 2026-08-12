import base64
import html
import io
import json
import math
import os
import re
import statistics
import tempfile
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

from app.schemas.blueprint import (
    BlueprintExtractionResult,
    BlueprintFloor,
    ExtractedSegment,
    GeminiFloorExtraction,
    GeminiSegment,
)

MAX_BLUEPRINT_BYTES = 25 * 1024 * 1024
GEMINI_MODEL = os.environ.get("GEMINI_VISION_MODEL", os.environ.get("GEMINI_MODEL", "gemini-flash-latest"))
PDF_RENDER_DPI = int(os.environ.get("BLUEPRINT_PDF_DPI", "200"))
DIMENSION_RE = re.compile(
    r"(?P<length_ft>\d+(?:\.\d+)?)\s*(?:['’`/]\s*(?P<length_in>\d+(?:\.\d+)?))?\s*"
    r"[xX×]\s*"
    r"(?P<width_ft>\d+(?:\.\d+)?)\s*(?:['’`/]\s*(?P<width_in>\d+(?:\.\d+)?))?"
)
ROOM_NAME_STOPWORDS = {
    "CLG",
    "CEILING",
    "COVERED",
    "PORCH",
    "BENCH",
    "SHLVS",
    "B.I.O",
    "REF",
    "VAULT",
    "VAULTED",
    "WIC",
    "WC",
}
MAX_REGION_TRACE_POINTS = 120
ROOM_WALL_CLOSE_FILTERS = (11, 17, 25, 35, 45)


def _safe_error_detail(exc: Exception) -> str:
    detail = str(exc).replace(os.environ.get("GEMINI_API_KEY", ""), "[redacted]")
    detail = re.sub(r"\s+", " ", detail).strip()
    if len(detail) > 220:
        detail = f"{detail[:217]}..."
    return f"{exc.__class__.__name__}: {detail}" if detail else exc.__class__.__name__


def _gemini_failure_message(exc: Exception) -> str:
    detail = _safe_error_detail(exc)
    lowered = detail.lower()
    if "429" in lowered or "too many requests" in lowered or "quota" in lowered or "rate" in lowered:
        return (
            "Gemini rate limit or quota was reached. Wait for the free-tier quota to reset, "
            "enable billing/increase quota in Google AI Studio, or try a smaller/clearer PDF."
        )
    if "500" in lowered or "servererror" in lowered or "internal" in lowered:
        return (
            "Gemini returned a server error while scanning this PDF. Try again later, or reduce BLUEPRINT_PDF_DPI "
            "to 150 and restart the backend."
        )
    return f"AI blueprint scanning failed. {detail}. Check GEMINI_API_KEY, GEMINI_MODEL, quota, then try again."


def _json_from_gemini_response(response: Any) -> Any:
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        if isinstance(parsed, GeminiFloorExtraction):
            return parsed.model_dump()
        return parsed

    text = (getattr(response, "text", "") or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    if not text:
        raise ValueError("Gemini returned an empty response.")
    return json.loads(text)


def _field(data: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in data:
            return data[name]
    lowered = {key.lower(): value for key, value in data.items()}
    for name in names:
        if name.lower() in lowered:
            return lowered[name.lower()]
    return None


def _coerce_polygon(value: Any) -> list[tuple[float, float]]:
    points = value
    if isinstance(value, dict):
        points = _field(value, "points", "coordinates", "vertices")
    if not isinstance(points, list):
        return []

    polygon: list[tuple[float, float]] = []
    for point in points:
        if isinstance(point, dict):
            x = _field(point, "x", "left")
            y = _field(point, "y", "top")
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            x, y = point[0], point[1]
        else:
            continue
        try:
            polygon.append((float(x), float(y)))
        except (TypeError, ValueError):
            continue
    return polygon


def _coerce_float(value: Any, default: float = 0) -> float:
    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        value = match.group(0) if match else value
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_gemini_floor_response(response: Any, page_number: int) -> GeminiFloorExtraction:
    data = _json_from_gemini_response(response)
    if isinstance(data, list):
        data = {"segments": data}
    if not isinstance(data, dict):
        raise ValueError("Gemini response was not a JSON object.")

    floors = _field(data, "floors", "pages")
    if isinstance(floors, list) and floors:
        first_floor = floors[0]
        if isinstance(first_floor, dict):
            data = first_floor

    raw_segments = _field(data, "segments", "rooms", "areas", "spaces")
    if not isinstance(raw_segments, list):
        raise ValueError("Gemini response did not include a segments/rooms list.")

    segments: list[GeminiSegment] = []
    for index, raw_segment in enumerate(raw_segments):
        if not isinstance(raw_segment, dict):
            continue
        name = str(_field(raw_segment, "segment_name", "room_name", "name", "label", "space_name") or f"Room {index + 1}").strip()
        area = _coerce_float(_field(raw_segment, "area_sqm", "area_square_meters", "area_m2", "area"))
        polygon = _coerce_polygon(_field(raw_segment, "polygon_coords", "polygon", "boundary", "coordinates", "points"))
        confidence = _coerce_float(_field(raw_segment, "confidence_score", "confidence", "score"), 0)
        if name and area > 0 and len(polygon) >= 3:
            segments.append(
                GeminiSegment(
                    segment_name=name,
                    area_sqm=area,
                    polygon_coords=polygon,
                    confidence_score=confidence,
                )
            )

    if not segments:
        raise ValueError("Gemini response did not contain usable room polygons.")
    floor_level = str(_field(data, "floor_level", "floor", "page_label", "level") or f"Page {page_number}").strip()
    return GeminiFloorExtraction(floor_level=floor_level, segments=segments)


def _gemini_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required to scan PDF blueprints.")
    return api_key


def _data_url(content: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _png_bytes(image: Any) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _image_ink_bounds(image: Any) -> tuple[float, float, float, float] | None:
    grayscale = image.convert("L")
    width, height = grayscale.size
    pixels = grayscale.load()
    min_x, min_y, max_x, max_y = width, height, 0, 0
    for y in range(height):
        for x in range(width):
            if pixels[x, y] < 120:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if min_x >= max_x or min_y >= max_y:
        return None
    return float(min_x), float(min_y), float(max_x), float(max_y)


def _polygon_bounds(segments: list[ExtractedSegment]) -> tuple[float, float, float, float] | None:
    points = [point for segment in segments for point in (segment.polygon_coords or [])]
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _bounds_iou(first: tuple[float, float, float, float], second: tuple[float, float, float, float]) -> float:
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[2], second[2])
    bottom = min(first[3], second[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    first_area = max(0, first[2] - first[0]) * max(0, first[3] - first[1])
    second_area = max(0, second[2] - second[0]) * max(0, second[3] - second[1])
    union = first_area + second_area - intersection
    return intersection / union if union > 0 else 0


def _align_segments_to_drawing(image: Any, segments: list[ExtractedSegment]) -> list[ExtractedSegment]:
    drawing_bounds = _image_ink_bounds(image)
    segment_bounds = _polygon_bounds(segments)
    if drawing_bounds is None or segment_bounds is None:
        return segments

    source_width = max(segment_bounds[2] - segment_bounds[0], 1)
    source_height = max(segment_bounds[3] - segment_bounds[1], 1)
    target_width = max(drawing_bounds[2] - drawing_bounds[0], 1)
    target_height = max(drawing_bounds[3] - drawing_bounds[1], 1)
    image_width, image_height = image.size

    margin_x = image_width * 0.08
    margin_y = image_height * 0.08
    needs_alignment = (
        segment_bounds[0] < -margin_x
        or segment_bounds[1] < -margin_y
        or segment_bounds[2] > image_width + margin_x
        or segment_bounds[3] > image_height + margin_y
    )
    if not needs_alignment:
        return segments

    aligned: list[ExtractedSegment] = []
    for segment in segments:
        if not segment.polygon_coords:
            aligned.append(segment)
            continue
        polygon = []
        for x, y in segment.polygon_coords:
            mapped_x = drawing_bounds[0] + ((x - segment_bounds[0]) / source_width) * target_width
            mapped_y = drawing_bounds[1] + ((y - segment_bounds[1]) / source_height) * target_height
            polygon.append((round(min(max(mapped_x, 0), image_width), 2), round(min(max(mapped_y, 0), image_height), 2)))
        aligned.append(
            ExtractedSegment(
                segment_name=segment.segment_name,
                area_sqm=segment.area_sqm,
                polygon_coords=polygon,
                confidence_score=segment.confidence_score,
            )
        )
    return aligned


def _dimension_area_sqm(value: str) -> float | None:
    match = DIMENSION_RE.search(value)
    if not match:
        return None
    length_feet = float(match.group("length_ft")) + float(match.group("length_in") or 0) / 12
    width_feet = float(match.group("width_ft")) + float(match.group("width_in") or 0) / 12
    area_sqm = length_feet * width_feet * 0.09290304
    return round(area_sqm, 2) if area_sqm > 0 else None


def _clean_room_name(value: str) -> str:
    value = DIMENSION_RE.sub("", value)
    value = re.sub(r"\([^)]*\)", "", value)
    value = re.sub(r"[/'+\\-×x]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" .:-")
    words = [word for word in value.split() if word.upper() not in ROOM_NAME_STOPWORDS]
    return " ".join(words).strip()[:150]


def _horizontally_overlaps(first: dict[str, Any], second: dict[str, Any]) -> bool:
    overlap = min(float(first["x1"]), float(second["x1"])) - max(float(first["x0"]), float(second["x0"]))
    return overlap > 0


def _segments_from_positioned_words(
    words: list[dict[str, Any]],
    page_width: float,
    page_height: float,
    image_width: int,
    image_height: int,
) -> list[ExtractedSegment]:
    if not words:
        return []

    lines: list[dict[str, Any]] = []
    for word in sorted(words, key=lambda item: (float(item["top"]), float(item["x0"]))):
        word_top = float(word["top"])
        previous_words = lines[-1]["words"] if lines else []
        previous_right = max((float(item["x1"]) for item in previous_words), default=0)
        starts_new_cluster = previous_words and float(word["x0"]) - previous_right > 35
        if not lines or abs(float(lines[-1]["top"]) - word_top) > 5 or starts_new_cluster:
            lines.append({"top": word_top, "words": [word]})
        else:
            lines[-1]["words"].append(word)

    parsed_lines: list[dict[str, Any]] = []
    for line in lines:
        line_words = line["words"]
        text = " ".join(str(word["text"]) for word in line_words)
        parsed_lines.append(
            {
                "text": text,
                "x0": min(float(word["x0"]) for word in line_words),
                "top": min(float(word["top"]) for word in line_words),
                "x1": max(float(word["x1"]) for word in line_words),
                "bottom": max(float(word["bottom"]) for word in line_words),
            }
        )

    segments: list[ExtractedSegment] = []
    seen: set[tuple[str, float]] = set()
    for index, line in enumerate(parsed_lines):
        area_sqm = _dimension_area_sqm(line["text"])
        if area_sqm is None:
            continue

        name = _clean_room_name(line["text"])
        context_lines = [line]
        lookback = index - 1
        while lookback >= 0 and line["top"] - parsed_lines[lookback]["bottom"] <= 28:
            candidate = _clean_room_name(parsed_lines[lookback]["text"])
            if candidate and _horizontally_overlaps(line, parsed_lines[lookback]):
                context_lines.insert(0, parsed_lines[lookback])
                name = f"{candidate} {name}".strip()
            lookback -= 1
        if not name:
            continue

        key = (name.upper(), area_sqm)
        if key in seen:
            continue
        seen.add(key)

        min_x = min(float(item["x0"]) for item in context_lines)
        min_y = min(float(item["top"]) for item in context_lines)
        max_x = max(float(item["x1"]) for item in context_lines)
        max_y = max(float(item["bottom"]) for item in context_lines)
        center_x = ((min_x + max_x) / 2) * image_width / page_width
        center_y = ((min_y + max_y) / 2) * image_height / page_height
        box_width = max((max_x - min_x) * image_width / page_width * 2.8, 90)
        box_height = max((max_y - min_y) * image_height / page_height * 3.0, 60)
        left = max(center_x - box_width / 2, 0)
        top = max(center_y - box_height / 2, 0)
        right = min(center_x + box_width / 2, image_width)
        bottom = min(center_y + box_height / 2, image_height)

        segments.append(
            ExtractedSegment(
                segment_name=name,
                area_sqm=area_sqm,
                polygon_coords=[(left, top), (right, top), (right, bottom), (left, bottom)],
                confidence_score=72,
            )
        )

    return segments


def _extract_pdf_text_segments(content: bytes, page_number: int, image_width: int, image_height: int) -> list[ExtractedSegment]:
    try:
        import pdfplumber
    except ImportError:
        return []

    try:
        with pdfplumber.open(io.BytesIO(content)) as document:
            if page_number > len(document.pages):
                return []
            page = document.pages[page_number - 1]
            words = page.extract_words(x_tolerance=3, y_tolerance=4, keep_blank_chars=False)
            page_width = float(page.width or image_width)
            page_height = float(page.height or image_height)
    except Exception:
        return []

    return _segments_from_positioned_words(words, page_width, page_height, image_width, image_height)


def _extract_ocr_segments(image: Any) -> list[ExtractedSegment]:
    try:
        import pytesseract
        from pytesseract import Output
    except ImportError:
        return []

    width, height = image.size
    grayscale = image.convert("L")
    best_segments: list[ExtractedSegment] = []
    seen_words: set[tuple[str, int, int]] = set()
    merged_words: list[dict[str, Any]] = []
    for page_segmentation_mode in (6, 11, 12):
        try:
            data = pytesseract.image_to_data(
                grayscale,
                output_type=Output.DICT,
                config=f"--psm {page_segmentation_mode}",
            )
        except Exception:
            continue

        words: list[dict[str, Any]] = []
        for index, text in enumerate(data.get("text", [])):
            value = str(text).strip()
            if not value:
                continue
            try:
                confidence = float(data["conf"][index])
            except (TypeError, ValueError):
                confidence = -1
            if confidence >= 0 and confidence < 20:
                continue
            left = float(data["left"][index])
            top = float(data["top"][index])
            word_width = float(data["width"][index])
            word_height = float(data["height"][index])
            word = {"text": value, "x0": left, "x1": left + word_width, "top": top, "bottom": top + word_height}
            words.append(word)
            key = (value.upper(), round(left / 8), round(top / 8))
            if key not in seen_words:
                seen_words.add(key)
                merged_words.append(word)
        segments = _segments_from_positioned_words(words, width, height, width, height)
        if len(segments) > len(best_segments):
            best_segments = segments

    merged_segments = _segments_from_positioned_words(merged_words, width, height, width, height)
    return merged_segments if len(merged_segments) > len(best_segments) else best_segments


def _nearest_open_pixel(passable: Any, start_x: int, start_y: int) -> tuple[int, int] | None:
    height, width = passable.shape
    if 0 <= start_x < width and 0 <= start_y < height and bool(passable[start_y, start_x]):
        return start_x, start_y
    for radius in range(1, 30):
        min_x = max(start_x - radius, 0)
        max_x = min(start_x + radius, width - 1)
        min_y = max(start_y - radius, 0)
        max_y = min(start_y + radius, height - 1)
        for x in range(min_x, max_x + 1):
            for y in (min_y, max_y):
                if bool(passable[y, x]):
                    return x, y
        for y in range(min_y, max_y + 1):
            for x in (min_x, max_x):
                if bool(passable[y, x]):
                    return x, y
    return None


def _flood_region(passable: Any, start: tuple[int, int]) -> list[tuple[int, int]]:
    from collections import deque

    height, width = passable.shape
    visited = set()
    queue = deque([start])
    visited.add(start)
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            point = (next_x, next_y)
            if point in visited or not bool(passable[next_y, next_x]):
                continue
            visited.add(point)
            queue.append(point)
            if len(visited) > width * height * 0.4:
                return []
    return list(visited)


def _simplify_orthogonal_polygon(points: Iterable[tuple[float, float]]) -> list[tuple[float, float]]:
    simplified: list[tuple[float, float]] = []
    for point in points:
        if simplified and point == simplified[-1]:
            continue
        simplified.append(point)

    changed = True
    while changed and len(simplified) > 3:
        changed = False
        next_points: list[tuple[float, float]] = []
        for index, point in enumerate(simplified):
            previous = simplified[index - 1]
            following = simplified[(index + 1) % len(simplified)]
            same_x = previous[0] == point[0] == following[0]
            same_y = previous[1] == point[1] == following[1]
            if same_x or same_y:
                changed = True
                continue
            next_points.append(point)
        simplified = next_points
    return simplified[:MAX_REGION_TRACE_POINTS]


def _region_to_orthogonal_polygon(
    region: list[tuple[int, int]],
    source_width: int,
    source_height: int,
    scale_x: float,
    scale_y: float,
) -> list[tuple[float, float]] | None:
    if len(region) < 20:
        return None

    rows: dict[int, list[int]] = {}
    for x, y in region:
        rows.setdefault(y, []).append(x)
    if len(rows) < 4:
        return None

    ordered_rows = sorted(rows.items())
    row_step = max(1, len(ordered_rows) // (MAX_REGION_TRACE_POINTS // 2))
    sampled_rows = ordered_rows[::row_step]
    if sampled_rows[-1][0] != ordered_rows[-1][0]:
        sampled_rows.append(ordered_rows[-1])

    left_edge = [(min(xs), y) for y, xs in sampled_rows]
    right_edge = [(max(xs), y) for y, xs in reversed(sampled_rows)]
    polygon = []
    for x, y in [*left_edge, *right_edge]:
        source_x = min(max(x * scale_x, 0), source_width)
        source_y = min(max(y * scale_y, 0), source_height)
        polygon.append((round(source_x, 2), round(source_y, 2)))

    simplified = _simplify_orthogonal_polygon(polygon)
    return simplified if len(simplified) >= 3 else None


def _room_passable_masks(image: Any) -> list[Any]:
    try:
        import numpy as np
        from PIL import Image, ImageFilter
    except ImportError:
        return []

    source_width, source_height = image.size
    max_side = 900
    scale = min(max_side / max(source_width, source_height), 1)
    working = image.convert("L")
    if scale < 1:
        working = working.resize((max(1, round(source_width * scale)), max(1, round(source_height * scale))))

    wall_mask = np.array(working) < 135
    masks = []
    for filter_size in ROOM_WALL_CLOSE_FILTERS:
        wall_image = Image.fromarray((wall_mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(filter_size))
        masks.append(np.array(wall_image) == 0)
    return masks


def _refine_segments_with_room_regions(image: Any, segments: list[ExtractedSegment]) -> list[ExtractedSegment]:
    if not segments:
        return []
    try:
        import numpy as np
    except ImportError:
        return segments

    source_width, source_height = image.size
    passable_masks = _room_passable_masks(image)
    if not passable_masks:
        return segments

    refined: list[ExtractedSegment] = []
    used_regions: set[tuple[int, int, int, int]] = set()
    for segment in segments:
        if not segment.polygon_coords:
            refined.append(segment)
            continue
        xs = [point[0] for point in segment.polygon_coords]
        ys = [point[1] for point in segment.polygon_coords]
        best_polygon: list[tuple[float, float]] | None = None
        best_region_key: tuple[int, int, int, int] | None = None
        best_region_size = 0
        for passable in passable_masks:
            scale_x = source_width / passable.shape[1]
            scale_y = source_height / passable.shape[0]
            anchor_x = round((min(xs) + max(xs)) / 2 / scale_x)
            anchor_y = round((min(ys) + max(ys)) / 2 / scale_y)
            start = _nearest_open_pixel(passable, anchor_x, anchor_y)
            if start is None:
                continue
            region = _flood_region(passable, start)
            if not region:
                continue
            region_xs = [point[0] for point in region]
            region_ys = [point[1] for point in region]
            width = max(region_xs) - min(region_xs)
            height = max(region_ys) - min(region_ys)
            if width < 8 or height < 8:
                continue
            region_key = (min(region_xs) // 4, min(region_ys) // 4, max(region_xs) // 4, max(region_ys) // 4)
            polygon = _region_to_orthogonal_polygon(region, source_width, source_height, scale_x, scale_y)
            if polygon is None:
                continue
            if best_polygon is None or len(region) > best_region_size:
                best_polygon = polygon
                best_region_key = region_key
                best_region_size = len(region)

        if best_polygon is None or best_region_key is None:
            refined.append(
                ExtractedSegment(
                    segment_name=segment.segment_name,
                    area_sqm=segment.area_sqm,
                    polygon_coords=segment.polygon_coords,
                    confidence_score=min(segment.confidence_score or 70, 74),
                )
            )
            continue

        confidence = max(segment.confidence_score or 0, 82 if best_region_key not in used_regions else 76)
        used_regions.add(best_region_key)
        refined.append(
            ExtractedSegment(
                segment_name=segment.segment_name,
                area_sqm=segment.area_sqm,
                polygon_coords=best_polygon,
                confidence_score=min(confidence, 90),
            )
        )
    return refined


def _fallback_pdf_floor(image: Any, image_bytes: bytes, page_number: int) -> BlueprintFloor:
    grayscale = image.convert("L")
    width, height = grayscale.size
    pixels = grayscale.load()
    min_x, min_y, max_x, max_y = width, height, 0, 0

    for y in range(height):
        for x in range(width):
            if pixels[x, y] < 245:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    segments: list[ExtractedSegment] = []
    if min_x < max_x and min_y < max_y:
        padding = 8
        min_x = max(min_x - padding, 0)
        min_y = max(min_y - padding, 0)
        max_x = min(max_x + padding, width)
        max_y = min(max_y + padding, height)
        segments.append(
            ExtractedSegment(
                segment_name=f"Blueprint Area {page_number}",
                area_sqm=1,
                polygon_coords=[(min_x, min_y), (max_x, min_y), (max_x, max_y), (min_x, max_y)],
                confidence_score=35,
            )
        )

    return BlueprintFloor(
        floor_level=f"Page {page_number}",
        image_url=_data_url(image_bytes, "image/png"),
        image_width=width,
        image_height=height,
        segments=segments,
    )


def _extract_pdf_page_with_gemini(image_bytes: bytes, page_number: int) -> GeminiFloorExtraction:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=_gemini_api_key())
    prompt = (
        "Analyze this architectural floor-plan blueprint page as a construction takeoff reviewer. "
        "Identify every real room or measurable area visible on the plan, including bedrooms, master, dining, "
        "living/great room, garages, closets, bathrooms, porches, balconies, and outdoor living areas when labeled. "
        "Trace each room's actual wall/space boundary in image pixel coordinates. Polygons may be rectangles, "
        "L-shapes, or irregular orthogonal shapes. Do not draw boxes around text labels, dimension text, furniture, "
        "fixtures, symbols, title blocks, or legends. The polygon must cover the room floor area itself. "
        "Use the printed room name when present. Compute area in square metres from printed dimensions when visible; "
        "otherwise estimate from scale only when the plan provides enough evidence. Return every possible room with "
        "a 0-100 confidence score, including low-confidence rooms. Low confidence is acceptable when uncertain; "
        "missing a room is worse than marking it low confidence."
    )
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type="image/png")],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    return _parse_gemini_floor_response(response, page_number)


def _extract_pdf(content: bytes) -> BlueprintExtractionResult:
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        convert_from_bytes = None

    try:
        if convert_from_bytes is None:
            raise RuntimeError("pdf2image is unavailable")
        images = convert_from_bytes(content, dpi=PDF_RENDER_DPI, fmt="png")
    except Exception:
        # pdf2image uses Poppler in production. pdfplumber provides a local fallback for
        # development environments where Poppler is not installed (notably Windows).
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(content)) as document:
                images = [page.to_image(resolution=PDF_RENDER_DPI).original for page in document.pages]
        except Exception as exc:
            raise RuntimeError("Could not render this PDF blueprint.") from exc

    if not images:
        raise ValueError("The PDF contains no readable pages.")

    floors: list[BlueprintFloor] = []
    for index, image in enumerate(images):
        image_bytes = _png_bytes(image)
        _gemini_api_key()
        try:
            detected = _extract_pdf_page_with_gemini(image_bytes, index + 1)
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(_gemini_failure_message(exc)) from exc
        segments: list[ExtractedSegment] = []
        for position, segment in enumerate(detected.segments):
            rounded_area = round(segment.area_sqm, 2)
            if rounded_area <= 0 or len(segment.polygon_coords) < 3:
                continue
            confidence = max(0, min(segment.confidence_score, 100))
            segments.append(
                ExtractedSegment(
                    segment_name=segment.segment_name.strip() or f"Segment {position + 1}",
                    area_sqm=rounded_area,
                    polygon_coords=segment.polygon_coords,
                    confidence_score=confidence,
                )
            )
        if not segments:
            raise RuntimeError("AI blueprint scanning found no usable room polygons. Upload a clearer PDF or a DXF/DWG file.")
        segments = _align_segments_to_drawing(image, segments)
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


def _cad_unit_to_metres(document: Any) -> float:
    declared_units = int(document.header.get("$INSUNITS", 0))
    factor = _unit_to_metres(declared_units)
    measurements = [
        float(entity.get_measurement())
        for entity in document.modelspace().query("DIMENSION")
        if 0 < float(entity.get_measurement()) < 100_000
    ]
    # Some architectural DWGs declare millimetres but store/model dimensions as metre
    # values (for example 2.4 for a 2.4 m wall). Trust repeated dimension entities over
    # the stale header when their median clearly follows metre-scale conventions.
    if declared_units in {4, 5} and len(measurements) >= 3:
        median_measurement = statistics.median(measurements)
        if 0.1 <= median_measurement <= 100:
            return 1.0
    return factor


def _cad_primitives(entities: Any, depth: int = 0) -> list[tuple[str, Any]]:
    if depth > 3:
        return []
    primitives: list[tuple[str, Any]] = []
    for entity in entities:
        kind = entity.dxftype()
        if kind == "LINE":
            primitives.append(("path", [(float(entity.dxf.start.x), float(entity.dxf.start.y)), (float(entity.dxf.end.x), float(entity.dxf.end.y))]))
        elif kind == "LWPOLYLINE":
            points = [(float(point[0]), float(point[1])) for point in entity.get_points("xy")]
            if entity.closed and points:
                points.append(points[0])
            if len(points) >= 2:
                primitives.append(("path", points))
        elif kind == "CIRCLE":
            primitives.append(("circle", (float(entity.dxf.center.x), float(entity.dxf.center.y), float(entity.dxf.radius))))
        elif kind in {"TEXT", "MTEXT"}:
            value = entity.dxf.text if kind == "TEXT" else entity.text
            insert = entity.dxf.insert
            if value and value.strip():
                primitives.append(("text", (float(insert.x), float(insert.y), value.strip().replace("\\P", " "))))
        elif kind in {"INSERT", "DIMENSION"}:
            try:
                primitives.extend(_cad_primitives(entity.virtual_entities(), depth + 1))
            except Exception:
                continue
    return primitives


def _robust_axis_bounds(values: list[float]) -> tuple[float, float]:
    ordered = sorted(values)
    if len(ordered) < 8:
        return ordered[0], ordered[-1]

    def percentile(ratio: float) -> float:
        position = (len(ordered) - 1) * ratio
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return ordered[lower]
        return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)

    first_quartile = percentile(0.25)
    third_quartile = percentile(0.75)
    spread = third_quartile - first_quartile
    if spread <= 0:
        return ordered[0], ordered[-1]
    lower_fence = first_quartile - spread * 10
    upper_fence = third_quartile + spread * 10
    retained = [value for value in ordered if lower_fence <= value <= upper_fence]
    return (retained[0], retained[-1]) if retained else (ordered[0], ordered[-1])


def _extract_cad_document(document: Any) -> BlueprintExtractionResult:
    try:
        from shapely.geometry import Point, Polygon
    except ImportError as exc:
        raise RuntimeError("CAD geometry support requires Shapely.") from exc

    modelspace = document.modelspace()
    polygons: list[Any] = []
    for entity in modelspace.query("LWPOLYLINE"):
        if not entity.closed:
            continue
        points = [(float(point[0]), float(point[1])) for point in entity.get_points("xy")]
        polygon = Polygon(points)
        if polygon.is_valid and polygon.area > 0:
            polygons.append(polygon)

    if not polygons:
        raise ValueError("No closed room boundaries were found in this DXF.")

    if len(polygons) > 1:
        largest = max(polygons, key=lambda polygon: polygon.area)
        next_largest_area = max(polygon.area for polygon in polygons if polygon is not largest)
        if largest.area > next_largest_area * 20:
            polygons.remove(largest)

    labels: list[tuple[str, Any]] = []
    for entity in list(modelspace.query("TEXT")) + list(modelspace.query("MTEXT")):
        text = entity.dxf.text if entity.dxftype() == "TEXT" else entity.text
        insert = entity.dxf.insert
        if text and text.strip():
            labels.append((text.strip().replace("\\P", " "), Point(float(insert.x), float(insert.y))))

    primitives = _cad_primitives(modelspace)
    primitive_points: list[tuple[float, float]] = []
    for kind, data in primitives:
        if kind == "path":
            primitive_points.extend(data)
        elif kind == "circle":
            x, y, radius = data
            primitive_points.extend([(x - radius, y - radius), (x + radius, y + radius)])
        elif kind == "text":
            primitive_points.append((data[0], data[1]))

    polygon_min_x = min(p.bounds[0] for p in polygons)
    polygon_min_y = min(p.bounds[1] for p in polygons)
    polygon_max_x = max(p.bounds[2] for p in polygons)
    polygon_max_y = max(p.bounds[3] for p in polygons)
    polygon_width = max(polygon_max_x - polygon_min_x, 1)
    polygon_height = max(polygon_max_y - polygon_min_y, 1)

    # A CAD modelspace often contains a title block or unrelated details far from the
    # detected areas. Frame the review around the detected geometry plus local context.
    # This keeps the actual work visible without cropping tightly to the overlay itself.
    context_x = max(polygon_width * 0.85, polygon_height * 1.25)
    context_y = max(polygon_height * 0.85, polygon_width * 0.35)
    focus_min_x = polygon_min_x - context_x
    focus_max_x = polygon_max_x + context_x
    focus_min_y = polygon_min_y - context_y
    focus_max_y = polygon_max_y + context_y

    nearby_points = [
        point
        for point in primitive_points
        if focus_min_x <= point[0] <= focus_max_x and focus_min_y <= point[1] <= focus_max_y
    ]
    if nearby_points:
        min_x = min(point[0] for point in nearby_points)
        min_y = min(point[1] for point in nearby_points)
        max_x = max(point[0] for point in nearby_points)
        max_y = max(point[1] for point in nearby_points)
    else:
        min_x, min_y, max_x, max_y = focus_min_x, focus_min_y, focus_max_x, focus_max_y
    width, height, padding = 1400, 900, 40
    scale = min((width - 2 * padding) / max(max_x - min_x, 1), (height - 2 * padding) / max(max_y - min_y, 1))

    def screen(point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return (round(padding + (x - min_x) * scale, 2), round(height - padding - (y - min_y) * scale, 2))

    svg_paths: list[str] = []
    for kind, data in primitives:
        if kind == "path" and not any(min_x <= point[0] <= max_x and min_y <= point[1] <= max_y for point in data):
            continue
        if kind in {"circle", "text"} and not (min_x <= data[0] <= max_x and min_y <= data[1] <= max_y):
            continue
        if kind == "path":
            points = " ".join(f"{x},{y}" for x, y in (screen(point) for point in data))
            svg_paths.append(f'<polyline points="{points}" fill="none" stroke="#475569" stroke-width="1.5"/>')
        elif kind == "circle":
            x, y, radius = data
            cx, cy = screen((x, y))
            svg_paths.append(f'<circle cx="{cx}" cy="{cy}" r="{round(radius * scale, 2)}" fill="none" stroke="#64748b" stroke-width="1.5"/>')
        elif kind == "text":
            x, y = screen((data[0], data[1]))
            svg_paths.append(f'<text x="{x}" y="{y}" fill="#334155" font-family="Arial,sans-serif" font-size="10">{html.escape(data[2])}</text>')
    segments: list[ExtractedSegment] = []
    metre_factor = _cad_unit_to_metres(document)
    for index, polygon in enumerate(polygons):
        area_sqm = round(polygon.area * math.pow(metre_factor, 2), 2)
        if area_sqm <= 0:
            continue
        coordinates = [screen((x, y)) for x, y in list(polygon.exterior.coords)[:-1]]
        name = next((text for text, point in labels if polygon.contains(point)), f"Room {index + 1}")
        svg_paths.append(f'<polygon points="{" ".join(f"{x},{y}" for x, y in coordinates)}" fill="none" stroke="#334155" stroke-width="2"/>')
        segments.append(
            ExtractedSegment(
                segment_name=name[:150],
                area_sqm=area_sqm,
                polygon_coords=coordinates,
                confidence_score=95 if not name.startswith("Room ") else 80,
            )
        )

    if not segments:
        raise ValueError(
            "No measurable room areas were found. Check the drawing units or export the blueprint as a scaled DXF."
        )

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="white"/>{"".join(svg_paths)}</svg>'
    image_url = f"data:image/svg+xml;charset=utf-8,{quote(svg)}"
    return BlueprintExtractionResult(
        floors=[BlueprintFloor(floor_level="Floor Plan", image_url=image_url, image_width=width, image_height=height, segments=segments)]
    )


def _extract_dxf(content: bytes) -> BlueprintExtractionResult:
    try:
        import ezdxf
    except ImportError as exc:
        raise RuntimeError("DXF support requires ezdxf and Shapely.") from exc

    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as temp:
        temp.write(content)
        temp_path = Path(temp.name)
    try:
        return _extract_cad_document(ezdxf.readfile(temp_path))
    finally:
        temp_path.unlink(missing_ok=True)


def _extract_dwg(content: bytes) -> BlueprintExtractionResult:
    try:
        import ezdxf
        from ezdxf.addons import odafc
    except ImportError as exc:
        raise RuntimeError("DWG support requires ezdxf and ODA File Converter.") from exc

    configured_path = os.environ.get("ODA_FILE_CONVERTER_PATH", "").strip()
    if configured_path:
        executable = Path(configured_path).expanduser().resolve()
        if not executable.is_file():
            raise RuntimeError("ODA_FILE_CONVERTER_PATH does not point to an installed executable.")
        option_name = "win_exec_path" if os.name == "nt" else "unix_exec_path"
        ezdxf.options.set("odafc-addon", option_name, str(executable))

    if not odafc.is_installed():
        raise RuntimeError(
            "DWG scanning requires ODA File Converter. Install it and set ODA_FILE_CONVERTER_PATH."
        )

    with tempfile.NamedTemporaryFile(suffix=".dwg", delete=False) as temp:
        temp.write(content)
        temp_path = Path(temp.name)
    try:
        try:
            document = odafc.readfile(temp_path, audit=True)
        except Exception as exc:
            raise RuntimeError("ODA File Converter could not convert this DWG file.") from exc
        return _extract_cad_document(document)
    finally:
        temp_path.unlink(missing_ok=True)


def extract_blueprint(filename: str, content: bytes) -> BlueprintExtractionResult:
    if not content:
        raise ValueError("The uploaded blueprint is empty.")
    if len(content) > MAX_BLUEPRINT_BYTES:
        raise ValueError("Blueprint files must be 25 MB or smaller.")

    extension = Path(filename).suffix.lower()
    if extension == ".pdf":
        return _extract_pdf(content)
    if extension == ".dxf":
        return _extract_dxf(content)
    if extension == ".dwg":
        return _extract_dwg(content)
    raise ValueError("Upload a PDF, DXF, or DWG blueprint.")
