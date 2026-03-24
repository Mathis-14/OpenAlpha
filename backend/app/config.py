from pathlib import Path

from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[2]


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
    backend_cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [s.strip() for s in self.backend_cors_origins.split(",") if s.strip()]


settings = Settings()
