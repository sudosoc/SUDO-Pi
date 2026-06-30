from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from app.services import security_service
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
    generate_csrf_token,
    pwd_context,
)


class TestSecurityCore:
    def test_password_hash_and_verify(self):
        pw = "MySecurePassword123!"
        hashed = pwd_context.hash(pw)
        assert pwd_context.verify(pw, hashed)
        assert not pwd_context.verify("wrong", hashed)

    def test_access_token_round_trip(self):
        token = create_access_token("user42")
        payload = verify_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user42"
        assert payload["type"] == "access"

    def test_refresh_token_round_trip(self):
        token, jti, expires = create_refresh_token("user42")
        payload = verify_refresh_token(token)
        assert payload is not None
        assert payload["sub"] == "user42"
        assert payload["jti"] == jti
        assert payload["type"] == "refresh"

    def test_access_token_contains_jti(self):
        token = create_access_token("user42")
        payload = verify_access_token(token)
        assert "jti" in payload

    def test_invalid_access_token_returns_none(self):
        payload = verify_access_token("not.a.real.token")
        assert payload is None

    def test_invalid_refresh_token_returns_none(self):
        payload = verify_refresh_token("garbage")
        assert payload is None

    def test_csrf_token_is_urlsafe_string(self):
        token = generate_csrf_token()
        assert isinstance(token, str)
        assert len(token) >= 32


class TestSecurityService:
    def test_is_safe_jail_name_valid(self):
        assert security_service._is_safe_jail_name("sudo-pi-auth")
        assert security_service._is_safe_jail_name("nginx-http-auth")

    def test_is_safe_jail_name_invalid(self):
        assert not security_service._is_safe_jail_name("../../etc/passwd")
        assert not security_service._is_safe_jail_name("jail; rm -rf /")

    def test_is_safe_ip_valid(self):
        assert security_service._is_safe_ip("192.168.4.100")
        assert security_service._is_safe_ip("10.0.0.1")

    def test_is_safe_ip_invalid(self):
        assert not security_service._is_safe_ip("not-an-ip")
        assert not security_service._is_safe_ip("192.168.1.1; rm -rf /")

    @pytest.mark.asyncio
    async def test_unban_ip_invalid_jail(self, db_session):
        with pytest.raises(ValueError, match="Invalid jail name"):
            await security_service.unban_ip("../malicious", "1.2.3.4")

    @pytest.mark.asyncio
    async def test_unban_ip_invalid_ip(self, db_session):
        with pytest.raises(ValueError, match="Invalid IP"):
            await security_service.unban_ip("sudo-pi-auth", "not-an-ip")
