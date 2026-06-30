from __future__ import annotations

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock

from app.services import system_service


@pytest.mark.asyncio
async def test_stats_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/system/stats")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_stats_authenticated(client: AsyncClient, auth_headers: dict):
    mock_stats = MagicMock()
    mock_stats.model_dump.return_value = {
        "cpu": {"percent": 10.0, "count": 4, "load_avg": [0.1, 0.2, 0.3], "freq_mhz": 1500.0},
        "memory": {"total": 8_000_000_000, "available": 6_000_000_000, "percent": 25.0, "used": 2_000_000_000},
        "disk": [],
        "temperature": {"cpu_celsius": 45.0, "source": "test"},
        "network": [],
        "uptime_seconds": 3600,
        "boot_time": "2026-01-01T00:00:00Z",
        "hostname": "test-pi",
        "processes": [],
    }
    with patch.object(system_service, "get_full_system_stats", AsyncMock(return_value=mock_stats)):
        resp = await client.get("/api/v1/system/stats", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_processes(client: AsyncClient, auth_headers: dict):
    mock_procs = [
        MagicMock(pid=1, name="systemd", status="sleeping", cpu_percent=0.1,
                  memory_percent=0.3, memory_rss_bytes=1024, user="root",
                  command="systemd", num_threads=1, created_time=0.0)
    ]
    with patch.object(system_service, "_get_top_processes", return_value=mock_procs):
        resp = await client.get("/api/v1/system/processes", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_kill_process_low_pid(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/v1/system/processes/1/kill", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_kill_process_not_found(client: AsyncClient, auth_headers: dict):
    with patch.object(system_service, "kill_process", AsyncMock(side_effect=ProcessLookupError("not found"))):
        resp = await client.post("/api/v1/system/processes/99999/kill", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_set_hostname_invalid(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/system/hostname",
        json={"hostname": "a b c"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_set_hostname_valid(client: AsyncClient, auth_headers: dict):
    with patch.object(system_service, "set_hostname", AsyncMock(return_value=True)):
        resp = await client.post(
            "/api/v1/system/hostname",
            json={"hostname": "my-pi"},
            headers=auth_headers,
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_set_timezone_valid(client: AsyncClient, auth_headers: dict):
    with patch.object(system_service, "set_timezone", AsyncMock(return_value=True)):
        resp = await client.post(
            "/api/v1/system/timezone",
            json={"timezone": "America/New_York"},
            headers=auth_headers,
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_set_timezone_invalid(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/system/timezone",
        json={"timezone": "not/a valid/tz"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


class TestSystemService:
    def test_get_top_processes_returns_list(self):
        procs = system_service._get_top_processes(n=5)
        assert isinstance(procs, list)
        assert len(procs) <= 5
        for p in procs:
            assert p.pid > 0
            assert isinstance(p.cpu_percent, float)

    @pytest.mark.asyncio
    async def test_kill_process_invalid_pid(self):
        with pytest.raises((ProcessLookupError, PermissionError)):
            await system_service.kill_process(9999999)
