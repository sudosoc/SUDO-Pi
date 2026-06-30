"""Tests for Docker service and API endpoints."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestDockerServiceWithMockClient:
    """Unit tests for Docker service with a mocked Docker client."""

    def _make_mock_container(self, cid="abc123", name="web", status="running", image_tags=None):
        c = MagicMock()
        c.short_id = cid
        c.name = name
        c.status = status
        c.image.tags = image_tags or ["nginx:latest"]
        c.image.short_id = "sha256:deadbeef"
        c.ports = {"80/tcp": [{"HostPort": "8080"}]}
        c.attrs = {"Created": "2024-01-01T00:00:00Z"}
        return c

    @pytest.mark.asyncio
    async def test_list_containers_with_mock(self):
        from app.services import docker_service
        mock_container = self._make_mock_container()
        mock_client = MagicMock()
        mock_client.containers.list.return_value = [mock_container]

        with patch.object(docker_service, "_client", return_value=mock_client):
            result = await docker_service.list_containers()

        assert len(result) == 1
        assert result[0]["name"] == "web"
        assert result[0]["status"] == "running"
        assert "8080->80/tcp" in result[0]["ports"]

    @pytest.mark.asyncio
    async def test_list_containers_empty(self):
        from app.services import docker_service
        mock_client = MagicMock()
        mock_client.containers.list.return_value = []
        with patch.object(docker_service, "_client", return_value=mock_client):
            result = await docker_service.list_containers()
        assert result == []

    @pytest.mark.asyncio
    async def test_container_action_start(self):
        from app.services import docker_service
        mock_container = self._make_mock_container(status="stopped")
        mock_client = MagicMock()
        mock_client.containers.get.return_value = mock_container

        with patch.object(docker_service, "_client", return_value=mock_client):
            result = await docker_service.container_action("abc123", "start")

        mock_container.start.assert_called_once()
        mock_container.reload.assert_called_once()

    @pytest.mark.asyncio
    async def test_container_action_stop(self):
        from app.services import docker_service
        mock_container = self._make_mock_container()
        mock_client = MagicMock()
        mock_client.containers.get.return_value = mock_container

        with patch.object(docker_service, "_client", return_value=mock_client):
            await docker_service.container_action("abc123", "stop")

        mock_container.stop.assert_called_once()

    @pytest.mark.asyncio
    async def test_container_action_restart(self):
        from app.services import docker_service
        mock_container = self._make_mock_container()
        mock_client = MagicMock()
        mock_client.containers.get.return_value = mock_container

        with patch.object(docker_service, "_client", return_value=mock_client):
            await docker_service.container_action("abc123", "restart")

        mock_container.restart.assert_called_once()

    @pytest.mark.asyncio
    async def test_container_action_invalid_raises(self):
        from app.services import docker_service
        mock_client = MagicMock()
        mock_client.containers.get.return_value = MagicMock()

        with patch.object(docker_service, "_client", return_value=mock_client):
            with pytest.raises(ValueError, match="not allowed"):
                await docker_service.container_action("abc123", "explode")

    @pytest.mark.asyncio
    async def test_container_action_not_found_raises(self):
        import docker
        from app.services import docker_service
        mock_client = MagicMock()
        mock_client.containers.get.side_effect = docker.errors.NotFound("not found")

        with patch.object(docker_service, "_client", return_value=mock_client):
            with pytest.raises(ValueError, match="not found"):
                await docker_service.container_action("nonexistent", "start")

    @pytest.mark.asyncio
    async def test_remove_container(self):
        from app.services import docker_service
        mock_container = self._make_mock_container()
        mock_client = MagicMock()
        mock_client.containers.get.return_value = mock_container

        with patch.object(docker_service, "_client", return_value=mock_client):
            result = await docker_service.remove_container("abc123", force=True)

        mock_container.remove.assert_called_once_with(force=True)
        assert result["status"] == "removed"

    @pytest.mark.asyncio
    async def test_list_images(self):
        from app.services import docker_service
        mock_image = MagicMock()
        mock_image.short_id = "sha256:deadbeef"
        mock_image.tags = ["ubuntu:22.04"]
        mock_image.attrs = {"Size": 77_000_000, "Created": "2024-01-01T00:00:00Z"}

        mock_client = MagicMock()
        mock_client.images.list.return_value = [mock_image]

        with patch.object(docker_service, "_client", return_value=mock_client):
            result = await docker_service.list_images()

        assert len(result) == 1
        assert "ubuntu:22.04" in result[0]["repo_tags"]

    @pytest.mark.asyncio
    async def test_daemon_unavailable_raises_runtime_error(self):
        from app.services import docker_service
        with patch.object(docker_service, "_client", side_effect=RuntimeError("Cannot connect to Docker")):
            with pytest.raises(RuntimeError, match="Cannot connect to Docker"):
                await docker_service.list_containers()


class TestDockerApi:
    """API-level tests for Docker endpoints."""

    @pytest.mark.asyncio
    async def test_list_containers_requires_auth(self, client):
        resp = await client.get("/api/v1/docker/containers")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_containers_authenticated(self, client, auth_headers):
        from app.services import docker_service
        with patch.object(docker_service, "_client") as mock_client_fn:
            mock_client_fn.return_value.containers.list.return_value = []
            resp = await client.get("/api/v1/docker/containers", headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_images_requires_auth(self, client):
        resp = await client.get("/api/v1/docker/images")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_images_authenticated(self, client, auth_headers):
        from app.services import docker_service
        with patch.object(docker_service, "_client") as mock_client_fn:
            mock_client_fn.return_value.images.list.return_value = []
            resp = await client.get("/api/v1/docker/images", headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_container_action_requires_auth(self, client):
        resp = await client.post("/api/v1/docker/containers/abc123/start")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_container_action_authenticated(self, client, auth_headers):
        from app.services import docker_service
        mock_container = MagicMock()
        mock_container.short_id = "abc123"
        mock_container.name = "web"
        mock_container.status = "running"
        mock_container.image.tags = ["nginx:latest"]
        mock_container.ports = {}
        mock_container.attrs = {"Created": "2024-01-01T00:00:00Z"}

        with patch.object(docker_service, "_client") as mock_client_fn:
            mock_client_fn.return_value.containers.get.return_value = mock_container
            resp = await client.post(
                "/api/v1/docker/containers/abc123/restart",
                headers=auth_headers,
            )
        assert resp.status_code == 200
