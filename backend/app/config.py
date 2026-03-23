from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mistral_api_key: str = ""
    fred_api_key: str = ""
    edgar_user_agent: str = "OpenAlpha dev@openalpha.io"
    backend_cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
