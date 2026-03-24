from pathlib import Path

from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[2]
_LOCAL_DEV_ORIGIN_PAIRS = {
    "http://localhost:3000": "http://127.0.0.1:3000",
    "http://127.0.0.1:3000": "http://localhost:3000",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mistral_api_key: str = ""
    mistral_model: str = "mistral-small-latest"
    fred_api_key: str = ""
    edgar_user_agent: str = "OpenAlpha dev@openalpha.io"
    # Include 127.0.0.1 so dev works when the site is opened as http://127.0.0.1:3000
    backend_cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins(self) -> list[str]:
        origins: list[str] = []
        for raw_origin in self.backend_cors_origins.split(","):
            origin = raw_origin.strip()
            if not origin:
                continue
            if origin not in origins:
                origins.append(origin)
            counterpart = _LOCAL_DEV_ORIGIN_PAIRS.get(origin)
            if counterpart and counterpart not in origins:
                origins.append(counterpart)
        return origins


settings = Settings()
