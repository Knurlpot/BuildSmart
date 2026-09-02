def check_published_version(source: str, region: str | None = None) -> dict[str, str]:
    if source == "DPWH":
        return {"status": "up_to_date", "release_label": "DPWH CMPD scraping removed"}
    if source == "PSA":
        return {"status": "up_to_date", "release_label": "Latest PSA Index"}
    raise ValueError("Unsupported source")
