from __future__ import annotations

import pytest
import tempfile
import os
from pathlib import Path
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock

from app.services import file_service


class TestFileService:
    def test_is_path_allowed_blocks_proc(self):
        assert not file_service._is_path_allowed("/proc/1/mem")

    def test_is_path_allowed_blocks_sys(self):
        assert not file_service._is_path_allowed("/sys/kernel/debug")

    def test_is_path_allowed_blocks_shadow(self):
        assert not file_service._is_path_allowed("/etc/shadow")

    def test_is_path_allowed_blocks_gshadow(self):
        assert not file_service._is_path_allowed("/etc/gshadow")

    def test_is_path_allowed_blocks_dev(self):
        assert not file_service._is_path_allowed("/dev/sda")

    def test_is_path_allowed_permits_home(self):
        assert file_service._is_path_allowed("/home/pi/test.txt")

    def test_is_path_allowed_permits_tmp(self):
        assert file_service._is_path_allowed("/tmp/myfile.txt")

    def test_is_path_allowed_permits_opt(self):
        assert file_service._is_path_allowed("/opt/sudo-pi/backend/.env")

    @pytest.mark.asyncio
    async def test_list_directory_real(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            Path(tmpdir, "a.txt").write_text("hello")
            Path(tmpdir, "b.txt").write_text("world")
            result = await file_service.list_directory(tmpdir)
            assert result["path"] == tmpdir
            names = [e["name"] for e in result["entries"]]
            assert "a.txt" in names
            assert "b.txt" in names

    @pytest.mark.asyncio
    async def test_read_file_real(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("hello world")
            path = f.name
        try:
            content = await file_service.read_file(path)
            assert content == "hello world"
        finally:
            os.unlink(path)

    @pytest.mark.asyncio
    async def test_write_file_real(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            path = f.name
        try:
            await file_service.write_file(path, "new content")
            assert Path(path).read_text() == "new content"
        finally:
            os.unlink(path)

    @pytest.mark.asyncio
    async def test_delete_file_real(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("to be deleted")
            path = f.name
        await file_service.delete_path(path)
        assert not Path(path).exists()

    @pytest.mark.asyncio
    async def test_rename_file_real(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            src = Path(tmpdir, "old.txt")
            src.write_text("data")
            await file_service.rename_path(str(src), "new.txt")
            assert Path(tmpdir, "new.txt").exists()
            assert not src.exists()

    @pytest.mark.asyncio
    async def test_make_directory_real(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            await file_service.make_directory(tmpdir, "subdir")
            assert Path(tmpdir, "subdir").is_dir()

    @pytest.mark.asyncio
    async def test_blocked_path_raises(self):
        with pytest.raises((PermissionError, ValueError)):
            await file_service.read_file("/etc/shadow")

    @pytest.mark.asyncio
    async def test_copy_file_real(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            src = Path(tmpdir, "src.txt")
            dst = Path(tmpdir, "dst.txt")
            src.write_text("copy me")
            await file_service.copy_path(str(src), str(dst))
            assert dst.exists()
            assert dst.read_text() == "copy me"


@pytest.mark.asyncio
async def test_list_directory_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/files", params={"path": "/tmp"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_directory_authenticated(client: AsyncClient, auth_headers: dict):
    with patch.object(file_service, "list_directory", AsyncMock(return_value={
        "path": "/tmp",
        "parent": "/",
        "entries": [],
        "total": 0,
    })):
        resp = await client.get("/api/v1/files", params={"path": "/tmp"}, headers=auth_headers)
    assert resp.status_code == 200
