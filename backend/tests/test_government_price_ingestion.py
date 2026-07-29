from app.services.pdf_extractor import HybridPDFExtractor


def test_parse_ocr_text_generates_normalized_rows():
    extractor = HybridPDFExtractor()
    ocr_text = """
    Item Description    Unit of Measurement    Unit Cost
    Portland Cement     bag                   250.00
    Reinforcing Steel   kg                    1,250.00
    """

    rows = extractor.parse_ocr_text(ocr_text)

    assert len(rows) == 2
    assert rows[0]["material_name"] == "Portland Cement"
    assert rows[0]["unit"] == "bag"
    assert rows[0]["unit_cost"] == 250.0
    assert rows[1]["unit_cost"] == 1250.0
