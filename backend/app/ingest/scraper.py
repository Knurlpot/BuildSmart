import hashlib
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from app.ingest.schemas import RawItemRow


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_file(url: str, dest: Path) -> tuple[Path, str]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=30.0, follow_redirects=True, verify=False) as response:
        response.raise_for_status()
        with dest.open("wb") as out_file:
            for chunk in response.iter_bytes():
                out_file.write(chunk)
    file_hash = compute_sha256(dest.read_bytes())
    return dest, file_hash


def fetch_psa_dataset_links(base_url: str) -> list[str]:
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(base_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        links = [
            urljoin(base_url, a["href"].strip())
            for a in soup.find_all("a", href=True)
            if any(ext in a["href"].lower() for ext in (".xlsx", ".csv"))
        ]
    return list(dict.fromkeys(links))


def parse_psa_table(df: Any, region: str, quarter: str, year: int) -> list[RawItemRow]:
    rows: list[RawItemRow] = []
    for _, row in df.iterrows():
        rows.append(RawItemRow(
            item_code=str(row.get("Item Code") or row.get("Code") or row.get("ItemCode") or "").strip() or None,
            raw_material_name=str(row.get("Item") or row.get("Material") or row.get("Description") or "").strip(),
            raw_unit=str(row.get("Unit") or row.get("UoM") or "").strip() or None,
            raw_price=row.get("Price") or row.get("Value") or row.get("Index") or None,
            region=region,
            quarter=quarter,
            year=year,
        ))
    return rows
