from pathlib import Path

import pandas as pd
import pytest

from app.services.pricelist_parser import (
    MissingColumnsError,
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


def test_infers_columns_when_headers_are_generic(tmp_path):
    generic_file = tmp_path / "generic.csv"
    generic_file.write_text(
        "A,B,C,D\n"
        "1,Portland Cement Type I 40kg,bag,Php 240.50\n"
        "2,DEFORMED REBAR 12MM X 6M GRADE 33,pcs,315.00\n"
        "3,Marine Plywood 1/4 x 4 x 8,sheet,₱ 680.00\n"
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
    # No content-based fallback exists for any of the three fields by design
    # (see MissingColumnsError's docstring) — a file with zero header signal
    # must fail with enough structure (available_columns, preview_rows,
    # detected_mapping) for a human to resolve via ColumnMappingStep.tsx,
    # not a guess from cell content.
    bad_file = tmp_path / "no_signal.csv"
    bad_file.write_text("Column1,Column2,Column3\nCement,bag,255.00\n")

    with pytest.raises(MissingColumnsError) as exc_info:
        parse_pricelist_file(str(bad_file))

    err = exc_info.value
    assert set(err.missing_columns) == {"raw_name", "raw_unit", "raw_price"}
    assert err.available_columns == ["Column1", "Column2", "Column3"]
    assert err.detected_mapping == {}
    assert err.preview_rows == [{"Column1": "Cement", "Column2": "bag", "Column3": "255.0"}]


def test_missing_columns_error_reports_partial_detection(tmp_path):
    # Only raw_name is unresolved here — detected_mapping should still
    # surface what WAS auto-detected so the mapping UI can pre-fill it and
    # only prompt the human for the one field that's actually missing.
    bad_file = tmp_path / "partial.csv"
    bad_file.write_text("Column1,Unit,Price\nCement,bag,255.00\n")

    with pytest.raises(MissingColumnsError) as exc_info:
        parse_pricelist_file(str(bad_file))

    err = exc_info.value
    assert err.missing_columns == ["raw_name"]
    assert err.detected_mapping == {"raw_unit": "Unit", "raw_price": "Price"}


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
