from pathlib import Path

import pandas as pd

REQUIRED_COLUMNS = {"raw_name", "raw_unit", "raw_price"}


def parse_pricelist_file(file_path: str) -> pd.DataFrame:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    else:
        raise ValueError(f"Unsupported price list file type: {suffix!r}")

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Price list file is missing required column(s): {sorted(missing)}")

    return df
