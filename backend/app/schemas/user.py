from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole


def _parse_pages(value):
    """Accept the model's JSON-string column OR a real list; emit a list|None."""
    if value is None:
        return None
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else None
        except Exception:
            return None
    return None


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=255)
    role: UserRole = UserRole.VIEWER
    allowed_pages: list[str] | None = None


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(None, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None
    # Explicit empty list = no pages; None = leave unchanged (see service)
    allowed_pages: list[str] | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str | None
    role: UserRole
    is_active: bool
    allowed_pages: list[str] | None = None
    created_at: datetime
    last_login_at: datetime | None
    last_login_ip: str | None

    model_config = {"from_attributes": True}

    @field_validator("allowed_pages", mode="before")
    @classmethod
    def _pages(cls, v):
        return _parse_pages(v)


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
