from pathlib import Path

import pandas as pd
import pytest

from app.services.pricelist_parser import (
    MissingColumnsError,
    _dedupe_and_label_columns,
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
    annotated_file.write_text("Material,Unit,Price (PHP)\nPortland Cement Type 1,bag,255.00\n")

    df = parse_pricelist_file(str(annotated_file))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert df.iloc[0]["raw_price"] == 255.0


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
