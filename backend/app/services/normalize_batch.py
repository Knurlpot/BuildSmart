import pandas as pd

from app.schemas.normalization import MaterialMatch
from app.services.normalizer import normalize_material
from app.services.normalizer_mock import ItemCandidate


def normalize_pricelist(
    df: pd.DataFrame,
    candidates: list[ItemCandidate],
    use_mock: bool | None = None,
) -> list[MaterialMatch]:
    return [
        normalize_material(row.raw_name, row.raw_unit, candidates, use_mock=use_mock)
        for row in df.itertuples()
    ]
