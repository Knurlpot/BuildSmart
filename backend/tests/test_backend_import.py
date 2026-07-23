from backend.main import app


def test_backend_app_imports() -> None:
    assert app is not None
