import base64
import io
import math
import os
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


def _extract_dxf(content: bytes) -> BlueprintExtractionResult:
    try:
        import ezdxf
        from shapely.geometry import Point, Polygon
    except ImportError as exc:
        raise RuntimeError("DXF support requires ezdxf and Shapely.") from exc

    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as temp:
        temp.write(content)
        temp_path = Path(temp.name)
    try:
        document = ezdxf.readfile(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

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

    labels: list[tuple[str, Any]] = []
    for entity in list(modelspace.query("TEXT")) + list(modelspace.query("MTEXT")):
        text = entity.dxf.text if entity.dxftype() == "TEXT" else entity.text
        insert = entity.dxf.insert
        if text and text.strip():
            labels.append((text.strip().replace("\\P", " "), Point(float(insert.x), float(insert.y))))

    min_x = min(p.bounds[0] for p in polygons)
    min_y = min(p.bounds[1] for p in polygons)
    max_x = max(p.bounds[2] for p in polygons)
    max_y = max(p.bounds[3] for p in polygons)
    width, height, padding = 1400, 900, 40
    scale = min((width - 2 * padding) / max(max_x - min_x, 1), (height - 2 * padding) / max(max_y - min_y, 1))

    def screen(point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return (round(padding + (x - min_x) * scale, 2), round(height - padding - (y - min_y) * scale, 2))

    svg_paths: list[str] = []
    segments: list[ExtractedSegment] = []
    metre_factor = _unit_to_metres(int(document.header.get("$INSUNITS", 0)))
    for index, polygon in enumerate(polygons):
        coordinates = [screen((x, y)) for x, y in list(polygon.exterior.coords)[:-1]]
        name = next((text for text, point in labels if polygon.contains(point)), f"Room {index + 1}")
        svg_paths.append(f'<polygon points="{" ".join(f"{x},{y}" for x, y in coordinates)}" fill="none" stroke="#334155" stroke-width="2"/>')
        segments.append(
            ExtractedSegment(
                segment_name=name[:150],
                area_sqm=round(polygon.area * math.pow(metre_factor, 2), 2),
                polygon_coords=coordinates,
                confidence_score=95 if not name.startswith("Room ") else 80,
            )
        )

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="white"/>{"".join(svg_paths)}</svg>'
    image_url = f"data:image/svg+xml;charset=utf-8,{quote(svg)}"
    return BlueprintExtractionResult(
        floors=[BlueprintFloor(floor_level="Floor Plan", image_url=image_url, image_width=width, image_height=height, segments=segments)]
    )


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
        raise ValueError("DWG files must be exported as DXF or PDF before scanning.")
    raise ValueError("Upload a PDF or DXF blueprint.")
