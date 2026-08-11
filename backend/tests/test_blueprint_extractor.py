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


def test_extracts_closed_dxf_room_with_label_and_area():
    result = extract_blueprint("floor-plan.dxf", make_dxf())

    assert len(result.floors) == 1
    floor = result.floors[0]
    assert floor.image_url.startswith("data:image/svg+xml")
    assert len(floor.segments) == 1
    assert floor.segments[0].segment_name == "Kitchen"
    assert floor.segments[0].area_sqm == 20
    assert len(floor.segments[0].polygon_coords or []) == 4


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
