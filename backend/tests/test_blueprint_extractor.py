import io

import ezdxf
import pytest
from PIL import Image

from app.schemas.blueprint import BlueprintFloor, GeminiFloorExtraction, GeminiSegment
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


def test_extracts_closed_dxf_room_with_label_and_area():
    result = extract_blueprint("floor-plan.dxf", make_dxf())

    assert len(result.floors) == 1
    floor = result.floors[0]
    assert floor.image_url.startswith("data:image/svg+xml")
    assert len(floor.segments) == 1
    assert floor.segments[0].segment_name == "Kitchen"
    assert floor.segments[0].area_sqm == 20
    assert len(floor.segments[0].polygon_coords or []) == 4
    assert "%3Cpolyline" in floor.image_url
    assert "Kitchen" in floor.image_url


def test_distant_cad_outlier_does_not_compress_the_preview():
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 4), (0, 4)], close=True)
    for offset in range(10):
        modelspace.add_line((offset / 2, 0), (offset / 2, 4))
    modelspace.add_line((-10_000, 0), (-9_999, 1))
    output = io.StringIO()
    document.write(output)

    result = extract_blueprint("outlier.dxf", output.getvalue().encode(document.encoding))
    xs = [point[0] for point in result.floors[0].segments[0].polygon_coords or []]

    assert max(xs) - min(xs) > 500


def test_sheet_border_does_not_shrink_detected_geometry():
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(10, 10), (15, 10), (15, 14), (10, 14)], close=True)
    modelspace.add_lwpolyline([(100, 0), (200, 0), (200, 80), (100, 80)], close=True)
    modelspace.add_line((0, 0), (200, 0))
    output = io.StringIO()
    document.write(output)

    result = extract_blueprint("sheet-border.dxf", output.getvalue().encode(document.encoding))
    xs = [point[0] for point in result.floors[0].segments[0].polygon_coords or []]

    assert max(xs) - min(xs) > 300


def test_skips_boundaries_that_round_to_zero_area():
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 4  # millimetres
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (1, 0), (1, 1), (0, 1)], close=True)
    output = io.StringIO()
    document.write(output)

    with pytest.raises(ValueError, match="No measurable room areas"):
        extract_blueprint("tiny.dxf", output.getvalue().encode(document.encoding))


def test_infers_metre_coordinates_from_dimension_entities_despite_mm_header():
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 4
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (5, 0), (5, 4), (0, 4)], close=True)
    modelspace.add_lwpolyline([(0, 0), (100, 0), (100, 100), (0, 100)], close=True)
    for offset, measurement in enumerate((2.0, 3.0, 4.0)):
        dimension = modelspace.add_linear_dim(
            base=(0, 10 + offset),
            p1=(0, 0),
            p2=(measurement, 0),
        )
        dimension.render()
    output = io.StringIO()
    document.write(output)

    result = extract_blueprint("incorrect-units.dxf", output.getvalue().encode(document.encoding))

    assert len(result.floors[0].segments) == 1
    assert result.floors[0].segments[0].area_sqm == 20


def test_rejects_empty_file():
    with pytest.raises(ValueError, match="empty"):
        extract_blueprint("floor-plan.pdf", b"")


def test_response_schema_discards_zero_area_segments_before_validation():
    floor = BlueprintFloor.model_validate(
        {
            "floor_level": "Ground Floor",
            "image_url": "data:image/png;base64,test",
            "image_width": 100,
            "image_height": 100,
            "segments": [
                {
                    "segment_name": "Invalid boundary",
                    "area_sqm": 0,
                    "polygon_coords": [(0, 0), (1, 0), (1, 1)],
                    "confidence_score": 80,
                }
            ],
        }
    )

    assert floor.segments == []


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


def test_dwg_requires_oda_when_converter_is_not_installed(monkeypatch):
    from ezdxf.addons import odafc

    monkeypatch.delenv("ODA_FILE_CONVERTER_PATH", raising=False)
    monkeypatch.setattr(odafc, "is_installed", lambda: False)
    with pytest.raises(RuntimeError, match="ODA File Converter"):
        extract_blueprint("floor-plan.dwg", b"not-empty")


def test_dwg_uses_oda_document_then_shared_geometry_extraction(monkeypatch):
    from ezdxf.addons import odafc

    monkeypatch.setenv("ODA_FILE_CONVERTER_PATH", "C:/Program Files/ODA/ODAFileConverter.exe")
    monkeypatch.setattr(blueprint_extractor.Path, "is_file", lambda _path: True)
    monkeypatch.setattr(odafc, "is_installed", lambda: True)

    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6
    modelspace = document.modelspace()
    modelspace.add_lwpolyline([(0, 0), (3, 0), (3, 2), (0, 2)], close=True)
    modelspace.add_text("Office", dxfattribs={"insert": (1.5, 1)})
    monkeypatch.setattr(odafc, "readfile", lambda _path, audit: document)

    result = extract_blueprint("office.dwg", b"dwg-content")

    assert result.floors[0].segments[0].segment_name == "Office"
    assert result.floors[0].segments[0].area_sqm == 6


def test_rejects_unknown_file_type():
    with pytest.raises(ValueError, match="PDF, DXF, or DWG"):
        extract_blueprint("floor-plan.txt", b"not-empty")
