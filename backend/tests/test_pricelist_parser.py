from pathlib import Path

import pytest

from app.services.pricelist_parser import parse_pricelist_file

FIXTURE = Path(__file__).parent / "fixtures" / "sample_pricelist.csv"


def test_parses_expected_columns_and_row_count():
    df = parse_pricelist_file(str(FIXTURE))

    assert {"raw_name", "raw_unit", "raw_price"}.issubset(df.columns)
    assert len(df) == 10


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
