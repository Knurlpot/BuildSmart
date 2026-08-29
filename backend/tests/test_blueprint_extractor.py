import io

import ezdxf
import pytest
from PIL import Image

from app.schemas.blueprint import GeminiDetectedSpace, GeminiFloorExtraction
from app.services.blueprint_extractor import extract_blueprint
from app.services.dxf.extractor import _axis_aligned_label_partitions, _close_linework_gaps, _iter_linework
from app.services.dxf.parser import _should_infer_closed_wall
from app.services.dxf.schemas import DxfDiagnostics, DxfExtractionConfig, NormalizedEntity
from shapely.geometry import LineString, Point, box
from shapely.ops import polygonize, unary_union


def make_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6  # metres
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 4), (0, 4)], close=True)
    modelspace.add_text("Kitchen", dxfattribs={"insert": (2.5, 2)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def test_open_space_partitions_are_rectangular_and_non_overlapping():
    points = [(0, Point(1400, 9200)), (1, Point(4800, 8100)), (2, Point(9500, 8200)), (3, Point(8200, 3500))]
    partitions = _axis_aligned_label_partitions((200, 200, 13800, 9800), points, [box(200, 200, 4450, 5450)])

    assert len(partitions) == 4
    for polygon in partitions.values():
        coords = list(polygon.exterior.coords)
        assert all(a[0] == b[0] or a[1] == b[1] for a, b in zip(coords, coords[1:]))
    values = list(partitions.values())
    assert all(values[i].intersection(values[j]).area == 0 for i in range(len(values)) for j in range(i + 1, len(values)))


def test_gap_closing_bridges_small_and_door_sized_wall_openings():
    for gap in (0.1, 0.8):
        left_end = (5 - gap) / 2
        right_start = (5 + gap) / 2
        walls = [
            LineString([(0, 0), (left_end, 0)]),
            LineString([(right_start, 0), (5, 0)]),
            LineString([(5, 0), (5, 4)]),
            LineString([(5, 4), (0, 4)]),
            LineString([(0, 4), (0, 0)]),
        ]
        diagnostics = DxfDiagnostics()
        closed = _close_linework_gaps(walls, 5, 1, DxfExtractionConfig(), diagnostics)
        assert len(list(polygonize(unary_union(closed)))) == 1
        assert diagnostics.closed_small_gaps + diagnostics.closed_door_gaps >= 1


def test_non_wall_layers_are_excluded_before_polygonization():
    def entity(entity_type: str, layer: str, geometry):
        return NormalizedEntity("1", entity_type, layer, "Model", None, geometry)

    wall = entity("LINE", "WALLS", LineString([(0, 0), (5, 0)]))
    room_boundary = entity("LINE", "ROOMS", LineString([(0, 4), (5, 4)]))
    excluded = [
        entity("LINE", "TEXT", LineString([(0, 1), (5, 1)])),
        entity("LINE", "FURNITURE", LineString([(0, 2), (5, 2)])),
        entity("LINE", "DIMENSION", LineString([(0, 3), (5, 3)])),
        entity("HATCH", "WALLS", box(0, 0, 5, 4)),
    ]
    assert _iter_linework([wall, room_boundary, *excluded]) == [wall.geometry, room_boundary.geometry]


def test_infers_closure_for_open_axis_aligned_wall_rectangle_only():
    rectangle = [(0, 0), (5, 0), (5, 4), (0, 4)]
    assert _should_infer_closed_wall(rectangle, "WALLS") is True
    assert _should_infer_closed_wall(rectangle, "FURNITURE") is False
    assert _should_infer_closed_wall([(0, 0), (5, 0), (4, 3), (0, 4)], "WALLS") is False


def test_infers_closure_for_nearly_closed_wall_path():
    assert _should_infer_closed_wall([(0, 0), (5, 0), (5, 4), (0.01, 0.01)], "WALLS") is True


def test_furniture_dimension_label_is_not_classified_as_room():
    from app.services.dxf.labels import space_label_name

    assert space_label_name("desk 1400x600 plan") is None
    assert space_label_name("BEDROOM 4.0x3.5") == "Bedroom"


def test_portuguese_room_labels_and_decimal_comma_areas_are_supported():
    from app.services.dxf.labels import extract_printed_area, space_label_name

    assert space_label_name("QUARTO\\PA=19,40m²") == "Bedroom"
    assert space_label_name("SUÍTE MASTER\\PA=23,16m²") == "Master Suite"
    assert space_label_name("SALA ESTAR JANTAR\\PA=77,48m²") == "Living and Dining Room"
    assert extract_printed_area("QUARTO\\PA=19,40m²") == 19.4
    assert space_label_name("MAIN ENTRANCE") is None


def test_open_axis_aligned_wall_polyline_becomes_detected_room_geometry():
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 4), (0, 4)], close=False, dxfattribs={"layer": "WALLS"})
    modelspace.add_text("BEDROOM", dxfattribs={"insert": (2.5, 2)})
    output = io.StringIO()
    document.write(output)

    result = extract_blueprint("open-rectangle.dxf", output.getvalue().encode(document.encoding))
    segment = result.floors[0].segments[0]

    assert segment.segment_name == "Bedroom"
    assert segment.area_sqm == 20
    assert segment.boundary_estimated is False


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


def make_duplicate_container_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (12, 0), (12, 6), (0, 6)], close=True, dxfattribs={"layer": "Tile 18x18"})
    modelspace.add_lwpolyline([(0, 0), (6, 0), (6, 6), (0, 6)], close=True, dxfattribs={"layer": "A-ROOM"})
    modelspace.add_lwpolyline([(0, 0), (6, 0), (6, 6), (0, 6)], close=True, dxfattribs={"layer": "HATCH"})
    modelspace.add_lwpolyline([(6, 0), (12, 0), (12, 6), (6, 6)], close=True, dxfattribs={"layer": "A-ROOM"})
    modelspace.add_text("BEDROOM", dxfattribs={"insert": (3, 3)})
    modelspace.add_text("KITCHEN", dxfattribs={"insert": (9, 3)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def make_l_shaped_room_with_offset_label_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    modelspace.add_lwpolyline(
        [(0, 0), (6, 0), (6, 2), (3, 2), (3, 5), (0, 5)],
        close=True,
        dxfattribs={"layer": "A-ROOM"},
    )
    modelspace.add_text("KITCHEN", dxfattribs={"insert": (3.3, 2.3)})
    modelspace.add_text("GROUND FLOOR PLAN", dxfattribs={"insert": (0, -1)})
    output = io.StringIO()
    document.write(output)
    return output.getvalue().encode(document.encoding)


def make_unlabeled_symbol_rooms_dxf() -> bytes:
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    bed_block = document.blocks.new(name="BED")
    bed_block.add_lwpolyline([(0, 0), (1.8, 0), (1.8, 2.0), (0, 2.0)], close=True, dxfattribs={"layer": "FURN"})
    toilet_block = document.blocks.new(name="TOILET")
    toilet_block.add_circle((0.4, 0.4), 0.25, dxfattribs={"layer": "FIXTURE"})
    toilet_block.add_lwpolyline([(0, 0), (0.8, 0), (0.8, 0.5), (0, 0.5)], close=True, dxfattribs={"layer": "FIXTURE"})
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 4), (0, 4)], close=True, dxfattribs={"layer": "A-WALL"})
    modelspace.add_lwpolyline([(7, 0), (10, 0), (10, 3), (7, 3)], close=True, dxfattribs={"layer": "A-WALL"})
    modelspace.add_blockref("BED", (1.5, 1), dxfattribs={"layer": "FURN"})
    modelspace.add_blockref("TOILET", (8, 1), dxfattribs={"layer": "FIXTURE"})
    modelspace.add_text("GROUND FLOOR PLAN", dxfattribs={"insert": (0, -1)})
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


def test_dedupes_duplicate_room_loops_and_rejects_floor_plate_container():
    result = extract_blueprint("duplicate-container.dxf", make_duplicate_container_dxf())

    segments = result.floors[0].segments
    names = sorted(segment.segment_name for segment in segments)
    assert names == ["Bedroom", "Kitchen"]
    assert all(segment.area_sqm == 36 for segment in segments)


def test_offset_label_keeps_l_shaped_room_polygon_instead_of_dimension_box():
    result = extract_blueprint("l-shaped-offset-label.dxf", make_l_shaped_room_with_offset_label_dxf())

    segment = result.floors[0].segments[0]

    assert segment.segment_name == "Kitchen"
    assert segment.area_sqm == 21
    assert len(segment.polygon_coords or []) == 6


def test_unlabeled_dxf_rooms_use_fixture_symbols_for_room_type():
    result = extract_blueprint("symbol-rooms.dxf", make_unlabeled_symbol_rooms_dxf())

    segments = result.floors[0].segments
    names = {segment.segment_name for segment in segments}
    categories = {segment.segment_name: segment.category for segment in segments}

    assert "Bedroom" in names
    assert "Bathroom" in names
    assert categories["Bedroom"] == "Bedrooms / Suites"
    assert categories["Bathroom"] == "Bathrooms & Services"


def test_rejects_empty_file():
    with pytest.raises(ValueError, match="empty"):
        extract_blueprint("floor-plan.pdf", b"")


def test_scanned_pdf_without_detected_blueprint_spaces_is_rejected(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    pdf = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(pdf, format="PDF")

    with pytest.raises(ValueError, match="No blueprint floor plan or room geometry"):
        extract_blueprint("floor-plan.pdf", pdf.getvalue())


def test_scanned_pdf_uses_gemini_single_floor_space_schema(monkeypatch):
    pdf = io.BytesIO()
    Image.new("RGB", (200, 100), "white").save(pdf, format="PDF")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def fake_extract(image_bytes: bytes, page_number: int) -> GeminiFloorExtraction:
        assert image_bytes
        assert page_number == 1
        return GeminiFloorExtraction(
            floor_name="Ground Floor Plan",
            total_detected_spaces=2,
            detected_spaces=[
                GeminiDetectedSpace(
                    id="space_1",
                    name="MAIN CORRIDOR",
                    category="Circulation & Hallways",
                    color_hex="#9B59B6",
                    bounding_box_1000=(350, 100, 430, 900),
                    confidence_score=0.9,
                ),
                GeminiDetectedSpace(
                    id="space_2",
                    name="UNLABELED_UTILITY_1",
                    category="Unassigned Utility",
                    color_hex="#7F8C8D",
                    bounding_box_1000=(430, 200, 520, 350),
                    confidence_score=0.85,
                ),
            ],
        )

    monkeypatch.setattr("app.services.blueprint_extractor._extract_pdf_page_with_gemini", fake_extract)

    result = extract_blueprint("floor-plan.pdf", pdf.getvalue())

    floor = result.floors[0]
    assert floor.floor_level == "Ground Floor Plan"
    assert [segment.segment_name for segment in floor.segments] == ["MAIN CORRIDOR", "UNLABELED_UTILITY_1"]
    assert floor.segments[0].category == "Circulation & Hallways"
    assert floor.segments[0].color_hex == "#9B59B6"
    assert floor.segments[0].polygon_coords == [(20.0, 35.0), (180.0, 35.0), (180.0, 43.0), (20.0, 43.0)]
    assert floor.segments[0].confidence_score == 90
    assert result.diagnostics is not None
    assert result.diagnostics["source"] == "gemini_vision"


def test_rejects_raw_image_uploads():
    with pytest.raises(ValueError, match="Image uploads are not supported"):
        extract_blueprint("floor-plan.bmp", b"not-empty")


def test_rejects_unknown_file_type():
    with pytest.raises(ValueError, match="PDF or DXF"):
        extract_blueprint("floor-plan.txt", b"not-empty")
