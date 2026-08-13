import io

import ezdxf
import pytest
from PIL import Image

from app.schemas.blueprint import GeminiFloorExtraction, GeminiSegment
from app.services import blueprint_extractor
from app.services.blueprint_extractor import extract_blueprint


def make_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6  # metres
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 4), (0, 4)], close=True)
    modelspace.add_text("Kitchen", dxfattribs={"insert": (2.5, 2)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def make_multifloor_open_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6  # metres
    modelspace = document.modelspace()
    floor_origins = [
        ("BASEMENT FLOOR PLAN", (0, 0)),
        ("GROUND FLOOR PLAN", (30, 0)),
        ("LOWER GROUND FLOOR PLAN", (0, -25)),
        ("FIRST FLOOR PLAN", (30, -25)),
    ]
    for label, (x, y) in floor_origins:
        modelspace.add_lwpolyline([(x, y), (x + 12, y), (x + 12, y + 8), (x, y + 8)])
        modelspace.add_line((x + 6, y), (x + 6, y + 8))
        modelspace.add_text(label, dxfattribs={"insert": (x + 1, y - 2)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def make_four_closed_floor_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6  # metres
    modelspace = document.modelspace()
    floor_origins = [
        ("BASEMENT FLOOR PLAN", (0, 30), "Storage"),
        ("GROUND FLOOR PLAN", (30, 30), "Kitchen"),
        ("LOWER GROUND FLOOR PLAN", (0, 0), "Bedroom"),
        ("FIRST FLOOR PLAN", (30, 0), "Bathroom"),
    ]
    for caption, (x, y), room in floor_origins:
        modelspace.add_lwpolyline([(x, y), (x + 10, y), (x + 10, y + 8), (x, y + 8)], close=True, dxfattribs={"layer": "WALL"})
        modelspace.add_text(room, dxfattribs={"insert": (x + 4, y + 4)})
        modelspace.add_text(caption, dxfattribs={"insert": (x + 1, y - 2)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def make_open_dxf_with_room_dimensions() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6  # metres
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (12, 0), (12, 8), (0, 8)])
    modelspace.add_line((0, 4), (12, 4))
    modelspace.add_line((6, 4), (6, 8))
    modelspace.add_line((6, 0), (6, 4))
    modelspace.add_text("GROUND FLOOR PLAN", dxfattribs={"insert": (1, -1)})
    modelspace.add_text("BED ROOM 3.65x4.45", dxfattribs={"insert": (3, 5)})
    modelspace.add_text("BATH 2.00x1.50", dxfattribs={"insert": (8, 5)})
    modelspace.add_text("KITCHEN", dxfattribs={"insert": (3, 2)})
    modelspace.add_text("3.00x2.50", dxfattribs={"insert": (3, 1.7)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def make_open_door_corridor_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    # Bedroom A, corridor, Bedroom B. Door openings are left as gaps in the shared walls.
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 1.2), (5, 2.2), (5, 4), (0, 4)], close=True, dxfattribs={"layer": "WALL"})
    modelspace.add_lwpolyline([(7, 0), (12, 0), (12, 4), (7, 4), (7, 2.2), (7, 1.2)], close=True, dxfattribs={"layer": "WALL"})
    modelspace.add_lwpolyline([(5, 0), (7, 0), (7, 1.2), (7, 2.2), (7, 4), (5, 4), (5, 2.2), (5, 1.2)], close=True, dxfattribs={"layer": "WALL"})
    modelspace.add_arc((5.2, 1.2), 0.8, 0, 90, dxfattribs={"layer": "DOOR"})
    modelspace.add_arc((6.8, 1.2), 0.8, 90, 180, dxfattribs={"layer": "DOOR"})
    modelspace.add_lwpolyline([(1, 1), (2.5, 1), (2.5, 2), (1, 2)], close=True, dxfattribs={"layer": "FURN"})
    modelspace.add_lwpolyline([(8, 1), (9.5, 1), (9.5, 2), (8, 2)], close=True, dxfattribs={"layer": "FURN"})
    modelspace.add_text("BED ROOM", dxfattribs={"insert": (2.5, 3)})
    modelspace.add_text("CORRIDOR", dxfattribs={"insert": (6, 2)})
    modelspace.add_text("BED ROOM", dxfattribs={"insert": (9.5, 3)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def test_extracts_closed_dxf_room_with_label_and_area():
    result = extract_blueprint("floor-plan.dxf", make_dxf())

    assert len(result.floors) == 1
    floor = result.floors[0]
    assert floor.image_url.startswith("data:image/svg+xml")
    assert len(floor.segments) == 1
    assert floor.segments[0].segment_name == "Kitchen"
    assert floor.segments[0].area_sqm == 20
    assert len(floor.segments[0].polygon_coords or []) == 4


def test_extracts_multiple_dxf_floor_regions_without_closed_rooms():
    result = extract_blueprint("multi-floor-plan.dxf", make_multifloor_open_dxf())

    assert [floor.floor_level for floor in result.floors] == [
        "Basement Floor Plan",
        "Ground Floor Plan",
        "Lower Ground Floor Plan",
        "First Floor Plan",
    ]
    assert all(floor.image_url.startswith("data:image/svg+xml") for floor in result.floors)
    assert result.diagnostics is not None
    assert result.diagnostics["candidate_spaces"] >= 0


def test_extracts_each_floor_cluster_as_its_own_scanning_page():
    result = extract_blueprint("four-closed-floors.dxf", make_four_closed_floor_dxf())

    assert [floor.floor_level for floor in result.floors] == [
        "Basement Floor Plan",
        "Ground Floor Plan",
        "Lower Ground Floor Plan",
        "First Floor Plan",
    ]
    assert all(len(floor.segments) == 1 for floor in result.floors)
    assert [floor.segments[0].segment_name for floor in result.floors] == ["Storage", "Kitchen", "Bedroom", "Bathroom"]
    assert all(floor.segments[0].area_sqm == 80 for floor in result.floors)


def test_extracts_dxf_room_segments_from_dimension_labels():
    result = extract_blueprint("dimension-labels.dxf", make_open_dxf_with_room_dimensions())

    segments = result.floors[0].segments
    names = {segment.segment_name for segment in segments}
    assert "Bathroom" in names
    assert all(segment.area_sqm > 0 for segment in segments)
    assert all(segment.polygon_coords and len(segment.polygon_coords) >= 3 for segment in segments)
    assert all(segment.confidence_score is None or 0 <= segment.confidence_score <= 100 for segment in segments)


def test_open_doors_keep_bedrooms_and_corridor_as_spaces_without_furniture_segments():
    result = extract_blueprint("open-door-corridor.dxf", make_open_door_corridor_dxf())

    names = [segment.segment_name for segment in result.floors[0].segments]
    assert names.count("Bedroom") >= 2
    assert "Corridor" in names
    assert "Unclassified Space" not in names
    assert all(segment.area_sqm > 0 for segment in result.floors[0].segments)
    assert all("Furniture" not in segment.segment_name for segment in result.floors[0].segments)


def test_rejects_empty_file():
    with pytest.raises(ValueError, match="empty"):
        extract_blueprint("floor-plan.pdf", b"")


def test_pdf_page_is_rendered_and_returned_with_detected_segments(monkeypatch):
    pdf = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(pdf, format="PDF")
    monkeypatch.setattr(
        blueprint_extractor,
        "_extract_pdf_page_with_gemini",
        lambda _content, _page: GeminiFloorExtraction(
            floor_level="Ground Floor",
            segments=[
                GeminiSegment(
                    segment_name="Living Room",
                    area_sqm=18.5,
                    polygon_coords=[(10, 10), (100, 10), (100, 70), (10, 70)],
                    confidence_score=92,
                )
            ],
        ),
    )

    result = extract_blueprint("floor-plan.pdf", pdf.getvalue())

    assert result.floors[0].floor_level == "Ground Floor"
    assert result.floors[0].image_url.startswith("data:image/png;base64,")
    assert result.floors[0].segments[0].segment_name == "Living Room"


def test_rejects_unknown_file_type():
    with pytest.raises(ValueError, match="PDF or DXF"):
        extract_blueprint("floor-plan.txt", b"not-empty")
