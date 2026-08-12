import base64
import html
import io
import math
import os
import statistics
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote

from tenacity import retry, stop_after_attempt, wait_exponential

from app.schemas.blueprint import (
    BlueprintExtractionResult,
    BlueprintFloor,
    ExtractedSegment,
    GeminiFloorExtraction,
)

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
        segments: list[ExtractedSegment] = []
        for position, segment in enumerate(detected.segments):
            rounded_area = round(segment.area_sqm, 2)
            if rounded_area <= 0 or len(segment.polygon_coords) < 3:
                continue
            segments.append(
                ExtractedSegment(
                    segment_name=segment.segment_name.strip() or f"Segment {position + 1}",
                    area_sqm=rounded_area,
                    polygon_coords=segment.polygon_coords,
                    confidence_score=segment.confidence_score,
                )
            )
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
