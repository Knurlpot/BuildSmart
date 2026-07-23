import hashlib
import os
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
    with httpx.stream("GET", url, timeout=30.0, follow_redirects=True) as response:
        response.raise_for_status()
        with dest.open("wb") as out_file:
            for chunk in response.iter_bytes():
                out_file.write(chunk)
    file_hash = compute_sha256(dest.read_bytes())
    return dest, file_hash


def _normalize_dpwh_url(base_url: str, href: str) -> str:
    return urljoin(base_url, href)


def fetch_dpwh_cmpd_links(base_url: str) -> list[str]:
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(base_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        candidates: list[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            href_lower = href.lower()
            text = (a.get_text(" ", strip=True) or "").lower()
            if not any(href_lower.endswith(ext) for ext in (".pdf", ".xlsx", ".csv")):
                continue

            if "cmpd" in href_lower or "cmpd" in text:
                candidates.append(_normalize_dpwh_url(base_url, href))
                continue
            if any(token in text for token in ("construction materials", "price data", "price list", "cmpd", "materials price", "materials and prices")):
                candidates.append(_normalize_dpwh_url(base_url, href))
                continue
            if any(token in href_lower for token in ("price", "materials", "cmpd", "construction")):
                candidates.append(_normalize_dpwh_url(base_url, href))

        # Preserve ordering while deduplicating
        return list(dict.fromkeys(candidates))


def fetch_psa_dataset_links(base_url: str) -> list[str]:
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(base_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        links = [
            _normalize_dpwh_url(base_url, a["href"].strip())
            for a in soup.find_all("a", href=True)
            if any(ext in a["href"].lower() for ext in (".xlsx", ".csv"))
        ]
    return list(dict.fromkeys(links))


def parse_dpwh_pdf_text(text: str, region: str, quarter: str, year: int) -> list[RawItemRow]:
    rows: list[RawItemRow] = []
    for line in text.splitlines():
        parts = [p.strip() for p in line.split("|") if p.strip()]
        if len(parts) < 3:
            continue
        item_code = parts[0] if parts[0].upper().startswith(("MG", "1M", "DP")) else None
        raw_name = parts[1]
        raw_unit = parts[2]
        raw_price = parts[3] if len(parts) > 3 else None
        rows.append(RawItemRow(
            item_code=item_code,
            raw_material_name=raw_name,
            raw_unit=raw_unit,
            raw_price=raw_price,
            region=region,
            quarter=quarter,
            year=year,
        ))
    return rows


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
