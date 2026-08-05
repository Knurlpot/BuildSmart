from pathlib import Path
import sys
import types

import pandas as pd
import pytest

from app.services.pricelist_parser import (
    MissingColumnsError,
    expand_dpwh_deo_price_columns,
    _parse_collapsed_pdf_item,
    _parse_pdf_text,
    _parse_pdf_ocr_table,
    _parse_simple_pricelist_ocr_table,
    _dedupe_and_label_columns,
    _pdf_table_to_dataframe,
    parse_pricelist_file,
)

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"
PDF_FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.pdf"
SYNONYM_FIXTURE = Path(__file__).parent / "fixtures" / "synonym_headers_pricelist.csv"


def test_parses_expected_columns_and_row_count():
    df = parse_pricelist_file(str(FIXTURE))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 10


def test_parses_pdf_with_a_real_gridded_table():
    df = parse_pricelist_file(str(PDF_FIXTURE))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 4
    assert df["raw_price"].dtype.kind == "f"
    assert df.iloc[0]["raw_name"] == "Portland Cement Type 1"
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[0]["raw_price"] == 255.0


def test_parses_collapsed_pdf_item_with_integer_price():
    row = _parse_collapsed_pdf_item("1.1 Portland Cement Type 1 40kg bag Republic bag 255")

    assert row is not None
    assert row["raw_name"] == "Portland Cement Type 1"
    assert row["raw_unit"] == "bag"
    assert row["raw_price"] == "255"


def test_pdf_table_with_title_row_and_wider_body_does_not_crash():
    frame = _pdf_table_to_dataframe(
        [
            ["Construction Materials Price Data"],
            ["Item No.", "Material Description", "Unit", "Unit Cost", "Remarks"],
            ["1", "Portland Cement Type 1", "bag", "255.00", ""],
            ["2", "Deformed Rebar 12mm x 6m", "pcs", "315.00", ""],
        ]
    )

    assert frame is not None
    assert list(frame.columns) == ["Item No.", "Material Description", "Unit", "Unit Cost", "Remarks"]
    assert len(frame) == 2


def test_recognizes_common_header_synonyms():
    df = parse_pricelist_file(str(SYNONYM_FIXTURE))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 2
    assert df.iloc[0]["raw_name"] == "Portland Cement Type 1"
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[0]["raw_price"] == 255.0


def test_recognizes_header_with_currency_annotation(tmp_path):
    # Real DPWH/PSA/supplier PDFs commonly tack a currency hint onto an
    # otherwise-recognized header (e.g. "Price (PHP)") — this is the exact
    # header a real uploaded PDF failed on before this fix.
    annotated_file = tmp_path / "annotated.csv"
    annotated_file.write_text(
        "Material,Unit,Price (PHP)\n"
        "Portland Cement Type 1,bag,255.00\n"
        "Portland Cement Type 1 40kg bag,bag,PHP 260 per bag\n"
    )

    df = parse_pricelist_file(str(annotated_file))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert df.iloc[0]["raw_price"] == 255.0
    assert df.iloc[1]["raw_price"] == 260.0


def test_parses_plain_peso_p_prefix_prices(tmp_path):
    peso_file = tmp_path / "plain-peso-prefix.csv"
    peso_file.write_text(
        "Material Name,Description / Specification,Brand,UOM,Min. Order,Price (PHP)\n"
        "Portland Cement,Type 1 Premium Quality 40kg bag,Republic Cement,Bag,50 Bags,P215.00\n"
    )

    df = parse_pricelist_file(str(peso_file))

    assert len(df) == 1
    assert df.iloc[0]["raw_name"] == "Portland Cement"
    assert df.iloc[0]["raw_unit"] == "Bag"
    assert df.iloc[0]["raw_price"] == 215.0


def test_pdf_text_fallback_splits_flat_supplier_table_rows(tmp_path, monkeypatch):
    pdf_file = tmp_path / "flat-table.pdf"
    pdf_file.write_bytes(b"%PDF-1.4\n%test\n")

    class FakePage:
        def extract_text(self):
            return "\n".join(
                [
                    "MATERIAL NAME DESCRIPTION / SPECIFICATION BRAND UOM MIN. ORDER PRICE (PHP)",
                    "Portland Cement Type 1 Premium Quality, 40kg bag Republic Cement Bag 50 Bags P215.00",
                    "Deformed Steel Bar Grade 33, 12mm x 6.0m Standard Length Pag-asa Steel Piece 200 Pcs P255.00",
                ]
            )

    class FakePdf:
        pages = [FakePage()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.pricelist_parser.pdfplumber.open", lambda path: FakePdf())

    df = _parse_pdf_text(pdf_file)

    assert df.iloc[0]["raw_name"] == "Portland Cement"
    assert df.iloc[0]["description"] == "Type 1 Premium Quality, 40kg bag"
    assert df.iloc[0]["raw_brand"] == "Republic Cement"
    assert df.iloc[0]["raw_unit"] == "Bag"
    assert df.iloc[0]["raw_price"] == "P215.00"
    assert df.iloc[1]["raw_name"] == "Deformed Steel Bar"
    assert df.iloc[1]["raw_unit"] == "Piece"


def test_pdf_ocr_fallback_groups_scanned_words_into_rows(tmp_path, monkeypatch):
    pdf_file = tmp_path / "scanned.pdf"
    pdf_file.write_bytes(b"%PDF-1.7\n%scanned\n")

    fake_pdf2image = types.SimpleNamespace(convert_from_path=lambda path, dpi=300: ["page-image"])
    fake_tesseract = types.SimpleNamespace(
        Output=types.SimpleNamespace(DICT="dict"),
        image_to_string=lambda image, config=None: "",
        image_to_data=lambda image, output_type=None, config=None: {
            "text": ["Material", "Description", "Unit", "Bacolod", "DEO", "Portland", "Cement", "bag", "260.00"],
            "conf": ["95"] * 9,
            "left": [10, 75, 310, 410, 485, 10, 90, 310, 410],
            "top": [10, 10, 10, 10, 10, 45, 45, 45, 45],
            "width": [58, 90, 35, 68, 35, 72, 62, 28, 60],
            "height": [14] * 9,
        },
    )
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    monkeypatch.setitem(sys.modules, "pytesseract", fake_tesseract)

    df = _parse_pdf_ocr_table(pdf_file)

    assert df is not None
    assert "Portland Cement" in " ".join(df.iloc[1].tolist())
    assert "260.00" in df.iloc[1].tolist()


def test_simple_pdf_ocr_fallback_parses_scanned_pricelist_lines(tmp_path, monkeypatch):
    pdf_file = tmp_path / "handwritten-simple.pdf"
    pdf_file.write_bytes(b"%PDF-1.7\n%scanned\n")

    fake_pdf2image = types.SimpleNamespace(convert_from_path=lambda path, dpi=300: ["page-image"])
    fake_tesseract = types.SimpleNamespace(
        Output=types.SimpleNamespace(DICT="dict"),
        image_to_string=lambda image, config=None: "",
        image_to_data=lambda image, output_type=None, config=None: {
            "text": [
                "Simple",
                "Construction",
                "Pricelist",
                "Portland",
                "Cement",
                "bag",
                "250.00",
                "Marine",
                "Plywood",
                "sheet",
                "690.50",
            ],
            "conf": ["95"] * 11,
            "left": [10, 65, 170, 10, 95, 220, 310, 10, 90, 220, 310],
            "top": [10, 10, 10, 45, 45, 45, 45, 82, 82, 82, 82],
            "width": [45, 90, 70, 72, 62, 30, 60, 65, 75, 42, 60],
            "height": [14] * 11,
        },
    )
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    monkeypatch.setitem(sys.modules, "pytesseract", fake_tesseract)

    df = _parse_simple_pricelist_ocr_table(pdf_file)

    assert df is not None
    assert len(df) == 2
    assert df.iloc[0].to_dict() == {
        "raw_name": "Portland Cement",
        "raw_unit": "bag",
        "raw_price": "250.00",
        "raw_brand": "Generic",
        "description": "",
    }
    assert df.iloc[1]["raw_name"] == "Marine Plywood"
    assert df.iloc[1]["raw_unit"] == "sheet"
    assert df.iloc[1]["raw_price"] == "690.50"


def test_simple_pdf_ocr_fallback_parses_price_before_unit_rows(tmp_path, monkeypatch):
    pdf_file = tmp_path / "photo-table.pdf"
    pdf_file.write_bytes(b"%PDF-1.7\n%scanned\n")

    fake_pdf2image = types.SimpleNamespace(convert_from_path=lambda path, dpi=300: ["page-image"])
    fake_tesseract = types.SimpleNamespace(
        Output=types.SimpleNamespace(DICT="dict"),
        image_to_string=lambda image, config=None: "Item price UOM\nCement 40 Bag\nPlywood 30 Sheet\nBlack Paint 80 Pail\n",
        image_to_data=lambda image, output_type=None, config=None: {
            "text": [
                "Item",
                "price",
                "UOM",
                "Cement",
                "40",
                "Bag",
                "Plywood",
                "30",
                "Sheet",
                "Black",
                "Paint",
                "80",
                "Pail",
            ],
            "conf": ["95"] * 13,
            "left": [10, 150, 245, 10, 150, 245, 10, 150, 245, 10, 82, 150, 245],
            "top": [10, 10, 10, 45, 45, 45, 82, 82, 82, 119, 119, 119, 119],
            "width": [42, 45, 42, 70, 28, 35, 78, 28, 52, 58, 55, 28, 35],
            "height": [14] * 13,
        },
    )
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)
    monkeypatch.setitem(sys.modules, "pytesseract", fake_tesseract)

    df = _parse_simple_pricelist_ocr_table(pdf_file)

    assert df is not None
    assert df[["raw_name", "raw_price", "raw_unit", "raw_brand", "description"]].to_dict("records") == [
        {"raw_name": "Cement", "raw_price": "40", "raw_unit": "Bag", "raw_brand": "Generic", "description": ""},
        {"raw_name": "Plywood", "raw_price": "30", "raw_unit": "Sheet", "raw_brand": "Generic", "description": ""},
        {"raw_name": "Black Paint", "raw_price": "80", "raw_unit": "Pail", "raw_brand": "Generic", "description": ""},
    ]


def test_infers_columns_when_headers_are_generic(tmp_path):
    generic_file = tmp_path / "generic.csv"
    generic_file.write_text(
        "A,B,C,D\n"
        "1,Portland Cement Type I 40kg,bag,Php 240.50\n"
        "2,DEFORMED REBAR 12MM X 6M GRADE 33,pcs,315.00\n"
        "3,Marine Plywood 1/4 x 4 x 8,sheet,₱ 680.00\n",
        encoding="utf-8",
    )

    df = parse_pricelist_file(str(generic_file))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 3
    assert df.iloc[0]["raw_name"] == "Portland Cement Type I 40kg"
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[0]["raw_price"] == 240.50


def test_preserves_material_as_item_name_and_extracts_specification_as_description(tmp_path):
    spec_file = tmp_path / "specification.csv"
    spec_file.write_text(
        "Material,Specification,Unit,Price\n"
        "Portland Cement,Class A Portland Cement 40kg Bag,bag,255.00\n"
        "Rebar,Grade 33 Deformed Bar 12mm x 6m,pcs,315.00\n"
    )

    df = parse_pricelist_file(str(spec_file))

    assert {"raw_name", "raw_unit", "raw_price", "description"}.issubset(df.columns)
    assert df.iloc[0]["raw_name"] == "Portland Cement"
    assert df.iloc[0]["description"] == "Class A Portland Cement 40kg Bag"
    assert df.iloc[1]["raw_name"] == "Rebar"
    assert df.iloc[1]["description"] == "Grade 33 Deformed Bar 12mm x 6m"


def test_detects_color_column(tmp_path):
    csv_file = tmp_path / "colors.csv"
    csv_file.write_text(
        "Material,Unit,Price,Color\n"
        "Ceramic Floor Tile,pc,120,Glossy White\n"
    )

    df = parse_pricelist_file(str(csv_file))

    assert "color" in df.columns
    assert df.iloc[0]["color"] == "Glossy White"


def test_detects_dpwh_location_column(tmp_path):
    csv_file = tmp_path / "dpwh-location.csv"
    csv_file.write_text(
        "Material Description,Unit Cost,Unit,Location\n"
        "Portland Cement Type 1,260.00,bag,Bacolod City\n"
    )

    df = parse_pricelist_file(str(csv_file))

    assert "location" in df.columns
    assert df.iloc[0]["location"] == "Bacolod City"


def test_expands_dpwh_deo_price_columns_to_location_rows():
    df = pd.DataFrame(
        [
            {
                "raw_name": "Portland Cement Type 1",
                "raw_unit": "bag",
                "Bacolod City DEO": "260.00",
                "Negros Occidental 1st DEO": "270.50",
            }
        ]
    )

    expanded = expand_dpwh_deo_price_columns(df, default_region="NIR")

    assert len(expanded) == 2
    assert set(expanded["location"]) == {"Bacolod City DEO", "Negros Occidental 1st DEO"}
    assert set(expanded["raw_price"]) == {260.0, 270.5}
    assert set(expanded["region"]) == {"NIR"}


def test_parse_then_expand_preserves_all_dpwh_deo_price_headers(tmp_path):
    csv_file = tmp_path / "dpwh-wide.csv"
    csv_file.write_text(
        "Material Description,Unit,Bacolod City DEO,Negros Occidental 1st DEO\n"
        "Portland Cement Type 1,bag,260.00,270.50\n"
    )

    df = parse_pricelist_file(str(csv_file))
    expanded = expand_dpwh_deo_price_columns(df, default_region="NIR")

    assert len(expanded) == 2
    assert set(expanded["location"]) == {"Bacolod City DEO", "Negros Occidental 1st DEO"}
    assert set(expanded["raw_price"]) == {260.0, 270.5}


def test_promotes_embedded_header_after_report_title_rows(tmp_path):
    report_file = tmp_path / "report.csv"
    report_file.write_text(
        "Construction Materials Price Data,,,\n"
        "NCR Quarterly Supplier Report,,,\n"
        "Item No.,Particulars,UOM,Unit Cost\n"
        "1,Portland Cement Type 1,bag,255.00\n"
        "2,Concrete Hollow Block 4 inch,pc,18.50\n"
        "Grand Total,,,273.50\n"
    )

    df = parse_pricelist_file(str(report_file))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 2
    assert df.iloc[0]["raw_name"] == "Portland Cement Type 1"
    assert df.iloc[1]["raw_unit"] == "pc"


def test_extracts_unit_from_material_name_when_unit_column_is_missing(tmp_path):
    missing_unit_file = tmp_path / "missing_unit.csv"
    missing_unit_file.write_text(
        "Material Description,Latest Price\n"
        "Cement Portland Type I 40kg bag,240.50\n"
        "PVC Pipe 4 inch length,180.00\n"
    )

    df = parse_pricelist_file(str(missing_unit_file))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 2
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[1]["raw_unit"] == "length"


def test_raises_on_missing_columns(tmp_path):
    bad_file = tmp_path / "bad.csv"
    bad_file.write_text("name,unit\nCement,bag\n")

    with pytest.raises(ValueError, match="missing required column"):
        parse_pricelist_file(str(bad_file))


def test_rejects_unrelated_document_text_even_if_values_look_extractable(tmp_path):
    unrelated_file = tmp_path / "proposal.csv"
    unrelated_file.write_text(
        "Section,Data Type,Notes\n"
        "UC-01,unit,\n"
        "Log-In,unit,\n"
        "Security,unit,3\n"
        "Performance,unit,3\n"
        "This use case outlines the authentication process wherein users provide their login credentials,unit,\n"
        "Student Instructor Admin,unit,\n"
    )

    with pytest.raises(ValueError, match="File NOT Supported"):
        parse_pricelist_file(str(unrelated_file))


def test_recognizes_headers_via_keyword_fallback(tmp_path):
    # None of these headers are in COLUMN_SYNONYMS verbatim ("Full Item
    # Description", "Packing Type", "Approx. Total Cost") — only substrings
    # ("item"/"desc", "pack", "cost") are, so this only passes via the
    # keyword-containment tier, not the exact synonym tier.
    csv_file = tmp_path / "keyword.csv"
    csv_file.write_text(
        "Full Item Description,Packing Type,Approx. Total Cost\n"
        "Portland Cement Type 1,bag,255.00\n"
    )

    df = parse_pricelist_file(str(csv_file))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert df.iloc[0]["raw_name"] == "Portland Cement Type 1"
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[0]["raw_price"] == 255.0


def test_identifier_columns_are_excluded_from_keyword_fallback(tmp_path):
    # "Material ID" contains the raw_name keyword "material", but must not be
    # picked over the real name column just because it's the first unclaimed
    # match — the identifier guard should skip it and fall through to
    # "Full Item Description" instead.
    csv_file = tmp_path / "with_id.csv"
    csv_file.write_text(
        "Material ID,Full Item Description,Unit,Price\n"
        "1,Portland Cement Type 1,bag,255.00\n"
    )

    df = parse_pricelist_file(str(csv_file))

    assert df.iloc[0]["raw_name"] == "Portland Cement Type 1"


def test_raises_with_structured_details_when_headers_give_no_signal(tmp_path):
    # Content-based inference (_infer_missing_columns) deliberately skips
    # itself when a file has zero header signal at all AND few columns —
    # nothing to anchor a guess to — so this must fail with enough structure
    # (available_columns, preview_rows) for a human to resolve via
    # ColumnMappingStep.tsx, not a silent guess from cell content.
    bad_file = tmp_path / "no_signal.csv"
    bad_file.write_text("Foo,Bar\nPortland Cement Type 1,255.00\n")

    with pytest.raises(MissingColumnsError) as exc_info:
        parse_pricelist_file(str(bad_file))

    err = exc_info.value
    assert set(err.missing_columns) == {"raw_name", "raw_unit", "raw_price"}
    assert err.available_columns == ["Foo", "Bar"]
    assert err.detected_mapping == {}


def test_column_mapping_resolves_a_file_with_no_header_signal(tmp_path):
    # The human-confirmed mapping a ColumnMappingStep.tsx submission would
    # send after the failure above — canonical field -> original header.
    bad_file = tmp_path / "no_signal2.csv"
    bad_file.write_text("Foo,Bar,Baz\nPortland Cement Type 1,bag,255.00\n")

    df = parse_pricelist_file(
        str(bad_file),
        column_mapping={"raw_name": "Foo", "raw_unit": "Bar", "raw_price": "Baz"},
    )

    assert df.iloc[0]["raw_name"] == "Portland Cement Type 1"
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[0]["raw_price"] == 255.0


def test_column_mapping_resolves_a_file_tiers_1_to_3_could_not(tmp_path):
    # The human-confirmed mapping a ColumnMappingStep.tsx submission would
    # send after the failure above — canonical field -> original header.
    bad_file = tmp_path / "no_signal.csv"
    bad_file.write_text("Column1,Column2,Column3\nCement,bag,255.00\n")

    df = parse_pricelist_file(
        str(bad_file),
        column_mapping={"raw_name": "Column1", "raw_unit": "Column2", "raw_price": "Column3"},
    )

    assert df.iloc[0]["raw_name"] == "Cement"
    assert df.iloc[0]["raw_unit"] == "bag"
    assert df.iloc[0]["raw_price"] == 255.0


def test_column_mapping_rejects_unknown_column(tmp_path):
    bad_file = tmp_path / "simple.csv"
    bad_file.write_text("Column1,Column2,Column3\nCement,bag,255.00\n")

    with pytest.raises(ValueError, match="not found in file"):
        parse_pricelist_file(
            str(bad_file),
            column_mapping={"raw_name": "Nonexistent", "raw_unit": "Column2", "raw_price": "Column3"},
        )


def test_deduplicates_blank_and_repeated_pdf_headers(tmp_path):
    # Real-world artifact seen from an actual pdfplumber extraction: a title
    # banner row merged into the table produces blank header cells, and a
    # PDF can otherwise repeat a header string across columns.
    df = pd.DataFrame([["a", "b"], ["c", "d"]], columns=["", ""])
    deduped = _dedupe_and_label_columns(df)
    assert list(deduped.columns) == ["Column 1", "Column 2"]


def test_raises_on_unsupported_extension(tmp_path):
    bad_file = tmp_path / "pricelist.txt"
    bad_file.write_text("raw_name,raw_unit,raw_price\nCement,bag,250\n")

    with pytest.raises(ValueError, match="Unsupported price list file type"):
        parse_pricelist_file(str(bad_file))
