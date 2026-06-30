from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_list_users_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/users")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_users_admin(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/v1/users", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] >= 1
    usernames = [u["username"] for u in body["items"]]
    assert settings.ADMIN_USERNAME in usernames


@pytest.mark.asyncio
async def test_create_user(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/users",
        json={
            "username": "testviewer",
            "email": "viewer@test.local",
            "password": "TestPass123!",
            "role": "viewer",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "testviewer"
    assert body["role"] == "viewer"
    return body["id"]


@pytest.mark.asyncio
async def test_create_user_duplicate_username(client: AsyncClient, auth_headers: dict):
    payload = {
        "username": "duplicate_user",
        "email": "dup1@test.local",
        "password": "TestPass123!",
        "role": "viewer",
    }
    resp1 = await client.post("/api/v1/users", json=payload, headers=auth_headers)
    assert resp1.status_code == 201
    resp2 = await client.post("/api/v1/users", json=payload, headers=auth_headers)
    assert resp2.status_code in (400, 409)


@pytest.mark.asyncio
async def test_create_user_weak_password(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/users",
        json={
            "username": "weakpwuser",
            "email": "weak@test.local",
            "password": "123",
            "role": "viewer",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_admin_user_blocked(client: AsyncClient, auth_headers: dict):
    users_resp = await client.get("/api/v1/users", headers=auth_headers)
    admin_id = next(
        u["id"] for u in users_resp.json()["items"]
        if u["username"] == settings.ADMIN_USERNAME
    )
    resp = await client.delete(f"/api/v1/users/{admin_id}", headers=auth_headers)
    assert resp.status_code in (400, 403)


@pytest.mark.asyncio
async def test_viewer_cannot_access_users(client: AsyncClient):
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "testviewer", "password": "TestPass123!"},
    )
    if login.status_code != 200:
        pytest.skip("testviewer not created yet")
    csrf = login.cookies.get("csrf_token", "")
    resp = await client.get("/api/v1/users", headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 403
