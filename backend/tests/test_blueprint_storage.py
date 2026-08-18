import asyncio
import io

import pytest
from fastapi import UploadFile

from app.routers import blueprint as blueprint_router
from app.schemas.blueprint import BlueprintExtractionResult, BlueprintFloor
from app.services import blueprint_storage


def test_storage_is_optional_when_credentials_are_missing(monkeypatch):
    for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BLUEPRINT_BUCKET"):
        monkeypatch.delenv(name, raising=False)

    assert blueprint_storage.storage_is_configured() is False
    assert blueprint_storage.persist_blueprint(12, "plan.pdf", b"pdf", "application/pdf") is None


def test_persists_file_when_supabase_is_configured(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "secret")
    monkeypatch.setenv("SUPABASE_BLUEPRINT_BUCKET", "blueprints")
    calls = []

    class Response:
        def raise_for_status(self):
            return None

    def fake_put(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setattr(blueprint_storage.httpx, "put", fake_put)
    stored = blueprint_storage.persist_blueprint(12, "Floor Plan.pdf", b"pdf", "application/pdf")

    assert stored is not None
    assert stored.bucket == "blueprints"
    assert stored.path.startswith("quotations/12/")
    assert stored.path.endswith(".pdf")
    assert calls[0][1]["content"] == b"pdf"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer secret"


def test_loads_saved_file_for_genuine_rescan(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "secret")
    monkeypatch.setenv("SUPABASE_BLUEPRINT_BUCKET", "blueprints")

    class Response:
        content = b"saved blueprint"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(blueprint_storage.httpx, "get", lambda *args, **kwargs: Response())
    assert blueprint_storage.load_blueprint("quotations/12/plan.pdf") == b"saved blueprint"


def test_load_rejects_paths_outside_quotation_prefix(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "secret")
    monkeypatch.setenv("SUPABASE_BLUEPRINT_BUCKET", "blueprints")
    with pytest.raises(ValueError, match="Invalid"):
        blueprint_storage.load_blueprint("../other/file.pdf")


def test_upload_still_extracts_when_storage_is_not_configured(monkeypatch):
    for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BLUEPRINT_BUCKET"):
        monkeypatch.delenv(name, raising=False)
    extracted = BlueprintExtractionResult(
        floors=[BlueprintFloor(floor_level="Floor Plan", image_url="data:test", image_width=10, image_height=10, segments=[])]
    )
    monkeypatch.setattr(blueprint_router, "extract_blueprint", lambda _name, _content: extracted)
    upload = UploadFile(filename="plan.pdf", file=io.BytesIO(b"pdf"))

    result = asyncio.run(blueprint_router.extract_uploaded_blueprint(19, upload))

    assert result.floors[0].floor_level == "Floor Plan"
    assert result.persistence_enabled is False
    assert result.blueprint_file_path is None


def test_upload_returns_persisted_path_when_storage_is_configured(monkeypatch):
    extracted = BlueprintExtractionResult(
        floors=[BlueprintFloor(floor_level="Floor Plan", image_url="data:test", image_width=10, image_height=10, segments=[])]
    )
    monkeypatch.setattr(blueprint_router, "storage_is_configured", lambda: True)
    monkeypatch.setattr(blueprint_router, "extract_blueprint", lambda _name, _content: extracted)
    monkeypatch.setattr(
        blueprint_router,
        "persist_blueprint",
        lambda *_args: blueprint_storage.StoredBlueprint(path="quotations/19/saved.pdf", bucket="blueprints"),
    )
    upload = UploadFile(filename="plan.pdf", file=io.BytesIO(b"pdf"))

    result = asyncio.run(blueprint_router.extract_uploaded_blueprint(19, upload))

    assert result.persistence_enabled is True
    assert result.blueprint_file_path == "quotations/19/saved.pdf"
