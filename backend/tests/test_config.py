from app.config import Settings


def test_localhost_origin_adds_127_counterpart() -> None:
    settings = Settings(backend_cors_origins="http://localhost:3000")
    assert settings.cors_origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_127_origin_adds_localhost_counterpart() -> None:
    settings = Settings(backend_cors_origins="http://127.0.0.1:3000")
    assert settings.cors_origins == [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ]


def test_custom_origin_is_left_unchanged() -> None:
    settings = Settings(backend_cors_origins="https://openalpha.app")
    assert settings.cors_origins == ["https://openalpha.app"]
