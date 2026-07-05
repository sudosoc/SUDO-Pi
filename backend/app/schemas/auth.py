from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)
    remember_me: bool = False


class TokenResponse(BaseModel):
    token_type: str = "bearer"
    expires_in: int


class UserInfoResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str | None
    role: str
    is_active: bool
    allowed_pages: list[str] | None = None

    model_config = {"from_attributes": True}

    @field_validator("allowed_pages", mode="before")
    @classmethod
    def _pages(cls, v):
        import json
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else None
            except Exception:
                return None
        return None


class AuthResponse(BaseModel):
    user: UserInfoResponse
    token_type: str = "bearer"
    expires_in: int
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    def model_post_init(self, __context) -> None:
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")


class RefreshResponse(BaseModel):
    token_type: str = "bearer"
    expires_in: int
    csrf_token: str
