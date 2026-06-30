"""Tests for package management service and API."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services import package_service


class TestPackageServiceValidation:
    """Unit tests for package name validation."""

    def test_valid_package_names(self):
        valid = ["curl", "vim", "python3-pip", "libssl-dev", "apt-utils", "net-tools", "gcc-12"]
        for name in valid:
            assert package_service._is_safe_package_name(name) is True, f"Expected {name!r} valid"

    def test_invalid_package_names(self):
        invalid = [
            "curl; rm -rf /",
            "../etc/passwd",
            "pkg$(whoami)",
            "",
            "a" * 130,
            "CAPS",
            "!bang",
            "pkg name",
        ]
        for name in invalid:
            assert package_service._is_safe_package_name(name) is False, f"Expected {name!r} invalid"

    @pytest.mark.asyncio
    async def test_install_invalid_name_raises(self):
        with pytest.raises(ValueError, match="Invalid package name"):
            await package_service.install_package("curl && rm -rf /")

    @pytest.mark.asyncio
    async def test_remove_invalid_name_raises(self):
        with pytest.raises(ValueError, match="Invalid package name"):
            await package_service.remove_package("../../etc/passwd")

    @pytest.mark.asyncio
    async def test_install_calls_apt_get(self):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, "", "")
            result = await package_service.install_package("curl")

        assert result == {"name": "curl", "status": "installed"}
        call_args = mock_run.call_args[0][0]
        assert "apt-get" in call_args
        assert "install" in call_args
        assert "curl" in call_args

    @pytest.mark.asyncio
    async def test_remove_calls_apt_get(self):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, "", "")
            result = await package_service.remove_package("curl")

        assert result == {"name": "curl", "status": "removed"}
        call_args = mock_run.call_args[0][0]
        assert "apt-get" in call_args
        assert "remove" in call_args
        assert "curl" in call_args

    @pytest.mark.asyncio
    async def test_install_failure_raises_runtime_error(self):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (1, "", "E: Package 'fake-pkg' has no installation candidate")
            with pytest.raises(RuntimeError, match="apt-get install failed"):
                await package_service.install_package("fake-pkg")

    @pytest.mark.asyncio
    async def test_remove_failure_raises_runtime_error(self):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (1, "", "E: Package 'nonexistent' is not installed")
            with pytest.raises(RuntimeError, match="apt-get remove failed"):
                await package_service.remove_package("nonexistent")

    @pytest.mark.asyncio
    async def test_list_installed_returns_dict_with_items_and_total(self):
        dpkg_output = (
            "curl\t7.88.1-10\tCommand line tool for transferring data\n"
            "vim\t2:9.0.1378-2\tVi IMproved\n"
            "python3\t3.11.6-1\tInteractive high-level object-oriented language\n"
        )
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, dpkg_output, "")
            result = await package_service.list_installed(skip=0, limit=10)

        assert "items" in result
        assert "total" in result
        assert result["total"] == 3
        assert len(result["items"]) == 3
        names = [item["name"] for item in result["items"]]
        assert "curl" in names
        assert "vim" in names

    @pytest.mark.asyncio
    async def test_list_installed_respects_pagination(self):
        lines = "\n".join(f"pkg{i}\t1.0\tDesc {i}" for i in range(20))
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, lines, "")
            result = await package_service.list_installed(skip=5, limit=5)

        assert result["total"] == 20
        assert len(result["items"]) == 5

    @pytest.mark.asyncio
    async def test_search_packages_returns_list(self):
        search_output = (
            "curl - Command line tool for transferring data with URL syntax\n"
            "libcurl4 - Easy-to-use client-side URL transfer library\n"
        )
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.side_effect = [
                (0, search_output, ""),
                (0, "curl\nlibcurl4\n", ""),
                (0, "Version: 7.88.1-10+deb12u7\n", ""),
                (0, "Version: 7.88.1-10+deb12u7\n", ""),
            ]
            results = await package_service.search_packages("curl")

        assert isinstance(results, list)
        assert len(results) >= 1
        names = [r["name"] for r in results]
        assert "curl" in names

    @pytest.mark.asyncio
    async def test_search_empty_query_returns_empty(self):
        result = await package_service.search_packages("")
        assert result == []

    @pytest.mark.asyncio
    async def test_search_too_long_query_returns_empty(self):
        result = await package_service.search_packages("q" * 200)
        assert result == []


class TestPackageApi:
    """API-level tests for package endpoints."""

    @pytest.mark.asyncio
    async def test_list_packages_requires_auth(self, client):
        resp = await client.get("/api/v1/packages")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_packages_authenticated(self, client, auth_headers):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, "curl\t7.88.1\tURL tool\n", "")
            resp = await client.get("/api/v1/packages", headers=auth_headers)

        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_search_requires_auth(self, client):
        resp = await client.get("/api/v1/packagessearch?q=curl")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_search_authenticated(self, client, auth_headers):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, "", "")
            resp = await client.get("/api/v1/packagessearch?q=curl", headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_install_requires_auth(self, client):
        resp = await client.post("/api/v1/packagesinstall", json={"name": "curl"})
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_install_with_auth(self, client, auth_headers):
        with patch.object(package_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, "curl installed", "")
            resp = await client.post(
                "/api/v1/packagesinstall",
                json={"name": "curl"},
                headers=auth_headers,
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "installed" or data.get("name") == "curl"

    @pytest.mark.asyncio
    async def test_upgrade_requires_auth(self, client):
        resp = await client.post("/api/v1/packagesupgrade")
        assert resp.status_code in (401, 403)
