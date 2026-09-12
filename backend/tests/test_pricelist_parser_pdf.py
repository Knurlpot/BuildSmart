import pandas as pd

from app.services import pricelist_parser
from app.services.pricelist_parser import (
    _parse_price_value,
    _split_flat_pdf_content,
    parse_pricelist_file,
)


def test_parses_csv_with_utf8_bom(tmp_path):
    csv_file = tmp_path / "pricelist.csv"
    csv_file.write_bytes(b"\xef\xbb\xbf" + b"name,price,unit,supplier\nCement,250,kg,Metro Steel\n")

    frame = parse_pricelist_file(str(csv_file))

    assert list(frame[["raw_name", "raw_price", "raw_unit"]].iloc[0]) == ["Cement", 250, "kg"]


def test_parses_excel_pricelist(tmp_path):
    excel_file = tmp_path / "pricelist.xlsx"
    pd.DataFrame([{"Material": "Rebar", "Unit Price": 1500, "UOM": "pcs"}]).to_excel(excel_file, index=False)

    frame = parse_pricelist_file(str(excel_file))

    assert frame.iloc[0]["raw_name"] == "Rebar"
    assert frame.iloc[0]["raw_price"] == 1500
    assert frame.iloc[0]["raw_unit"] == "pcs"


def test_pdf_flat_content_split_extracts_material_fields():
    fields = _split_flat_pdf_content("Cement Type 1 40kg bag 250.00")

    assert fields["raw_name"] == "Cement"
    assert fields["description"] == "Type 1 40kg bag 250.00"
    assert fields["raw_brand"] == "Generic"


def test_price_parser_handles_currency_and_commas():
    assert _parse_price_value("PHP 1,500.25") == 1500.25


def test_pdf_parser_recovers_price_collapsed_into_material_name(monkeypatch, tmp_path):
    pdf_file = tmp_path / "metro-hardware.pdf"
    pdf_file.write_bytes(b"%PDF-1.4")
    monkeypatch.setattr(
        pricelist_parser,
        "_parse_pdf",
        lambda _path: pd.DataFrame(
            [
                {
                    "MATERIAL NAME": "Eagle Portland Cement Type 1 40kg bag, standard grey cement for general structural use bag ₱215.00 Cement",
                    "DESCRIPTION": "",
                    "UOM": "",
                    "UNIT PRICE": "",
                },
                {
                    "MATERIAL NAME": "Deformed Bar Grade 33 (10mm) 6 meters length standard rebar pc ₱170.00 Steel",
                    "DESCRIPTION": "",
                    "UOM": "",
                    "UNIT PRICE": "",
                },
                {
                    "MATERIAL NAME": "40kg bag, blended hydraulic cement for masonry & Pozzolan Cement bag Holcim ₱200.00 plastering",
                    "DESCRIPTION": "",
                    "UOM": "",
                    "UNIT PRICE": "",
                },
            ]
        ),
    )

    frame = parse_pricelist_file(str(pdf_file))

    assert list(frame["raw_unit"]) == ["bag", "pc", "bag"]
    assert list(frame["raw_price"]) == [215, 170, 200]
    assert frame.iloc[2]["raw_name"] == "Pozzolan Cement"
    assert "blended hydraulic cement" in frame.iloc[2]["description"]
