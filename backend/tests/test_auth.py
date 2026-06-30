from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "user" in body
    assert body["user"]["username"] == settings.ADMIN_USERNAME
    assert body["user"]["role"] == "admin"
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies
    assert "csrf_token" in resp.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": "definitely-wrong"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "nobody", "password": "irrelevant"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_account_lockout(client: AsyncClient):
    for _ in range(5):
        await client.post(
            "/api/v1/auth/login",
            json={"username": settings.ADMIN_USERNAME, "password": "wrong"},
        )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert resp.status_code in (401, 423)


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == settings.ADMIN_USERNAME


@pytest.mark.asyncio
async def test_csrf_required_for_post(client: AsyncClient):
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code in (403, 401)


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/v1/auth/logout", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.cookies.get("access_token") in (None, "")


@pytest.mark.asyncio
async def test_token_refresh(client: AsyncClient):
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    assert login.status_code == 200
    csrf = login.cookies.get("csrf_token", "")
    resp = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "wrong-old", "new_password": "NewP@ss123"},
        headers=auth_headers,
    )
    assert resp.status_code in (400, 401)


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
