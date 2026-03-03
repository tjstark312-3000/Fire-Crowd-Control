from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Scottsdale Fire Department (SFD) Crowd API"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
    allow_sqlite: bool = False
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/sfd_crowd"
    database_echo: bool = False
    database_pool_size: int = Field(default=10, ge=1, le=100)
    database_max_overflow: int = Field(default=20, ge=0, le=100)
    database_pool_timeout: int = Field(default=30, ge=1, le=300)
    database_pool_recycle: int = Field(default=1800, ge=60, le=86_400)
    database_connect_timeout: int = Field(default=10, ge=1, le=120)
    default_target_fps: int = 2
    default_alert_threshold: int = 120
    model_path: Path = Path(__file__).resolve().parents[2] / "models" / "crowd_model_stride8.onnx"
    sample_video_path: Path = Path(__file__).resolve().parents[2] / "data" / "sample.mp4"
    overlay_alpha: float = 0.65
    heatmap_temporal_smoothing: float = Field(default=0.35, ge=0.0, le=0.95)
    heatmap_max_width: int = Field(default=640, ge=160, le=3840)
    heatmap_png_compression: int = Field(default=3, ge=0, le=9)
    analytics_event_queue_size: int = Field(default=128, ge=16, le=4096)
    frame_max_width: int = Field(default=640, ge=160, le=3840)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if not raw:
            return []
        if raw.startswith("[") and raw.endswith("]"):
            try:
                decoded = json.loads(raw)
                if isinstance(decoded, list):
                    return [str(origin).strip() for origin in decoded if str(origin).strip()]
            except json.JSONDecodeError:
                pass
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_database_backend(self) -> "Settings":
        database_url = self.database_url.strip()
        is_sqlite = database_url.startswith("sqlite")
        is_postgres = database_url.startswith("postgresql+psycopg://")

        if is_sqlite and not self.allow_sqlite:
            raise ValueError("SQLite is disabled by default. Set a PostgreSQL DATABASE_URL or ALLOW_SQLITE=true.")

        if not is_sqlite and not is_postgres:
            raise ValueError("DATABASE_URL must use postgresql+psycopg:// (or sqlite:// only with ALLOW_SQLITE=true).")

        self.database_url = database_url
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
