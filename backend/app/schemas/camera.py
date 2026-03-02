from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$")
DEVICE_INDEX_PATTERN = re.compile(r"^\d+$")
LOCAL_DEVICE_SCHEMES = {"device", "camera"}


class CameraBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    stream_url: str = Field(min_length=3, max_length=512)
    enabled: bool = True
    target_fps: int = Field(default=2, ge=1, le=5)
    alert_threshold: int = Field(default=120, ge=1, le=10000)

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not NAME_PATTERN.fullmatch(normalized):
            raise ValueError("name must use letters, numbers, spaces, underscores, or hyphens")
        return normalized

    @field_validator("stream_url")
    @classmethod
    def validate_stream_url(cls, value: str) -> str:
        normalized = value.strip()
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https", "rtsp", "sim", *LOCAL_DEVICE_SCHEMES}:
            raise ValueError("stream_url scheme must be one of: http, https, rtsp, sim, device, camera")
        if parsed.scheme == "sim":
            if not parsed.netloc and not parsed.path:
                raise ValueError("sim URLs must include a source, e.g. sim://sample")
        elif parsed.scheme in LOCAL_DEVICE_SCHEMES:
            raw_index = parsed.netloc or parsed.path.lstrip("/")
            if not raw_index:
                raise ValueError("device URLs must include a camera index, e.g. device://0")
            if not DEVICE_INDEX_PATTERN.fullmatch(raw_index):
                raise ValueError("device URL index must be a non-negative integer, e.g. device://0")
        elif not parsed.netloc:
            raise ValueError("stream_url must include host")
        return normalized


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    stream_url: str | None = Field(default=None, min_length=3, max_length=512)
    enabled: bool | None = None
    target_fps: int | None = Field(default=None, ge=1, le=5)
    alert_threshold: int | None = Field(default=None, ge=1, le=10000)

    @field_validator("name")
    @classmethod
    def sanitize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return CameraBase.sanitize_name(value)

    @field_validator("stream_url")
    @classmethod
    def validate_optional_stream_url(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return CameraBase.validate_stream_url(value)


class CameraOut(BaseModel):
    id: str
    name: str
    stream_url: str
    enabled: bool
    target_fps: int
    alert_threshold: int
    status: str
    last_latency_ms: float | None = None
    last_processed_fps: float | None = None
    last_crowd_count: float | None = None
    last_update_ts: datetime | None = None
    preview_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LatestSnapshot(BaseModel):
    camera_id: str
    ts: datetime | None = None
    status: str
    processed_fps: float
    latency_ms: float
    crowd_count: float
    density_overlay_png_base64: str
    frame_jpeg_base64: str | None = None
    message: str | None = None
