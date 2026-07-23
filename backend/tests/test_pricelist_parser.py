from pathlib import Path

import pytest

from app.services.pricelist_parser import parse_pricelist_file

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


def test_raises_on_unsupported_extension(tmp_path):
    bad_file = tmp_path / "pricelist.txt"
    bad_file.write_text("raw_name,raw_unit,raw_price\nCement,bag,250\n")

    with pytest.raises(ValueError, match="Unsupported price list file type"):
        parse_pricelist_file(str(bad_file))
