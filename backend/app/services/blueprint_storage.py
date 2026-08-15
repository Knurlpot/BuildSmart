import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import httpx


@dataclass(frozen=True)
class StoredBlueprint:
    path: str
    bucket: str


def storage_config() -> tuple[str, str, str] | None:
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    bucket = os.environ.get("SUPABASE_BLUEPRINT_BUCKET", "").strip()
    return (url, key, bucket) if url and key and bucket else None


def storage_is_configured() -> bool:
    return storage_config() is not None


def _object_url(url: str, bucket: str, path: str) -> str:
    encoded_path = "/".join(quote(part, safe="") for part in path.split("/"))
    return f"{url}/storage/v1/object/{quote(bucket, safe='')}/{encoded_path}"


def persist_blueprint(quotation_id: int, filename: str, content: bytes, content_type: str | None) -> StoredBlueprint | None:
    config = storage_config()
    if config is None:
        return None
    url, key, bucket = config
    suffix = Path(filename).suffix.lower()
    path = f"quotations/{quotation_id}/{uuid.uuid4().hex}{suffix}"
    response = httpx.put(
        _object_url(url, bucket, path),
        content=content,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": content_type or "application/octet-stream",
            "x-upsert": "false",
        },
        timeout=30,
    )
    response.raise_for_status()
    return StoredBlueprint(path=path, bucket=bucket)


def load_blueprint(path: str) -> bytes:
    config = storage_config()
    if config is None:
        raise RuntimeError("Persistent blueprint storage is not configured.")
    url, key, bucket = config
    if not path.startswith("quotations/") or ".." in path.split("/"):
        raise ValueError("Invalid saved blueprint path.")
    response = httpx.get(
        _object_url(url, bucket, path),
        headers={"Authorization": f"Bearer {key}", "apikey": key},
        timeout=30,
    )
    response.raise_for_status()
    return response.content
