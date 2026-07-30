import pandas as pd

from app.schemas.normalization import MaterialMatch
from app.services.match_cache import normalize_match_key
from app.services.normalizer import normalize_material
from app.services.normalizer_mock import ItemCandidate


def _cached_match(candidate: ItemCandidate, raw_brand: str | None) -> MaterialMatch:
    # A previously human-approved mapping for this exact (normalized) text —
    # treated as maximum confidence, skipping both scorers entirely.
    return MaterialMatch(
        matched_item_code=candidate["item_code"],
        confidence=1.0,
        category_type=candidate["category_type"],
        item_name=candidate["item_name"],
        material=candidate["material"],
        brand=raw_brand if raw_brand and raw_brand != "Generic" else candidate["brand"],
        unit=candidate["unit"],
        is_new_item=False,
    )


def normalize_pricelist(
    df: pd.DataFrame,
    candidates: list[ItemCandidate],
    cache_lookup: dict[tuple[str, str], int] | None = None,
) -> list[MaterialMatch]:
    candidates_by_code = {c["item_code"]: c for c in candidates}
    results = []

    for row in df.itertuples():
        raw_brand = getattr(row, "raw_brand", "Generic")
        cached_item_code = (
            cache_lookup.get(normalize_match_key(row.raw_name, row.raw_unit)) if cache_lookup else None
        )
        # A cache entry can point at an item_code that no longer exists (e.g. the
        # item was later deleted) — fall through to normal scoring rather than crash.
        cached_candidate = candidates_by_code.get(cached_item_code) if cached_item_code is not None else None

        if cached_candidate is not None:
            results.append(_cached_match(cached_candidate, raw_brand))
            continue

        results.append(
            normalize_material(
                row.raw_name,
                row.raw_unit,
                candidates,
                raw_brand=raw_brand,
            )
        )

    return results
