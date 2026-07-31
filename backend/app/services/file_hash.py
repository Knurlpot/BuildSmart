import hashlib
from pathlib import Path


def calculate_file_hash(file_path: str | Path) -> str:
    sha256_hash = hashlib.sha256()
    with Path(file_path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            sha256_hash.update(block)
    return sha256_hash.hexdigest()


def calculate_file_size(file_path: str | Path) -> int:
    return Path(file_path).stat().st_size
