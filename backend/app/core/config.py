from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Scottsdale Fire Department (SFD) Crowd API"
    api_prefix: str = "/api"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
    database_url: str = "sqlite:///./sfd_crowd.db"
    default_target_fps: int = 2
    default_alert_threshold: int = 120
    model_path: Path = Path(__file__).resolve().parents[2] / "models" / "crowd_model_stride8.onnx"
    sample_video_path: Path = Path(__file__).resolve().parents[2] / "data" / "sample.mp4"
    overlay_alpha: float = 0.65

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return value
        return []


@lru_cache
def get_settings() -> Settings:
    return Settings()
