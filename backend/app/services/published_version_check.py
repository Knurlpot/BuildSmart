from typing import Literal


def check_published_version(source: str, region: str | None = None) -> dict[str, str]:
    # Placeholder logic. DPWH should compare the latest known published release
    # against the database's last recorded release. Without a real DPWH release
    # source contract, we assume there's always a new release available.
    if source == "DPWH":
        return {"status": "new_available", "release_label": f"Latest DPWH CMPD ({region or 'NCR'})"}
    if source == "PSA":
        return {"status": "up_to_date", "release_label": "Latest PSA Index"}
    raise ValueError("Unsupported source")
