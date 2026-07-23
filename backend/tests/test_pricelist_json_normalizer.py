from pathlib import Path

import pytest
import pandas as pd

from app.schemas.pricelist import NormalizedPriceRecord
from app.services.pricelist_json_normalizer import normalize_pricelist_dataframe


def test_normalize_pricelist_dataframe_canonicalizes_and_flags_missing_price():
    rows = [
        {"raw_name": "CEM PORTLAND T1 40KG", "raw_unit": "bag", "raw_price": "255.00"},
        {"raw_name": "DEFORMED BAR G40 12MM", "raw_unit": "pcs", "raw_price": "1,250"},
        {"raw_name": "CHB 4 INCH NON-LOAD", "raw_unit": "pc.", "raw_price": None},
        {"raw_name": "Unknown Material", "raw_unit": "unknown", "raw_price": "100"},
    ]
    df = pd.DataFrame(rows)

    normalized = normalize_pricelist_dataframe(df, source_agency="DPWH", region="NCR")

    assert len(normalized) == 4
    assert normalized[0].item_name == "Portland Cement (Type 1, 40kg Bag)"
    assert normalized[0].category == "Concrete & Masonry"
    assert normalized[0].unit == "bag"
    assert normalized[0].price == 255.0
    assert normalized[0].source_agency == "DPWH"
    assert normalized[0].region == "NCR"
    assert normalized[0].is_flagged is False

    assert normalized[1].item_name == "Deformed Steel Bar (Grade 40, 12mm x 6m)"
    assert normalized[1].category == "Steel & Structural Metals"
    assert normalized[1].unit == "piece"
    assert normalized[1].price == 1250.0
    assert normalized[1].is_flagged is False

    assert normalized[2].item_name == "Concrete Hollow Block (4-inch Non-Load Bearing)"
    assert normalized[2].category == "Concrete & Masonry"
    assert normalized[2].unit == "piece"
    assert normalized[2].price is None
    assert normalized[2].is_flagged is True
    assert "Missing price" in normalized[2].flag_reason

    assert normalized[3].item_name == "Unknown Material"
    assert normalized[3].category == "Others"
    assert normalized[3].unit == "other"
    assert normalized[3].is_flagged is True
    assert "Unrecognized unit" in normalized[3].flag_reason


def test_normalize_pricelist_dataframe_handles_price_symbols_and_whitespace():
    df = pd.DataFrame(
        [
            {"raw_name": "Latex Paint White", "raw_unit": "gal", "raw_price": "₱ 500.00 ", "raw_price2": 500},
        ]
    )
    normalized = normalize_pricelist_dataframe(df, source_agency="PSA")

    assert normalized[0].price == 500.0
    assert normalized[0].unit == "gallon"
    assert normalized[0].source_agency == "PSA"
    assert normalized[0].currency == "PHP"
    assert normalized[0].is_flagged is False
