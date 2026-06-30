from __future__ import annotations

import asyncio
import os
import shutil
import stat
import tarfile
import zipfile
from pathlib import Path

import aiofiles
from loguru import logger

from app.schemas.files import DirectoryListing, FileEntry

_ROOT_ALLOWED_PATHS = ["/home", "/etc", "/var", "/opt", "/tmp", "/root", "/srv"]
_BLOCKED_PATHS = ["/etc/shadow", "/etc/gshadow", "/proc", "/sys", "/dev"]


def _is_path_allowed(path: str) -> bool:
    p = Path(path).resolve()
    for blocked in _BLOCKED_PATHS:
        if str(p).startswith(blocked):
            return False
    return True


def _stat_to_entry(path: Path) -> FileEntry | None:
    try:
        s = path.stat(follow_symlinks=False)
        is_sym = path.is_symlink()
        sym_target = str(path.resolve()) if is_sym else None

        try:
            import pwd, grp
            owner = pwd.getpwuid(s.st_uid).pw_name
            group = grp.getgrgid(s.st_gid).gr_name
        except (KeyError, ImportError):
            owner = str(s.st_uid)
            group = str(s.st_gid)

        mode = stat.filemode(s.st_mode)
        return FileEntry(
            name=path.name,
            path=str(path),
            is_dir=path.is_dir(),
            size_bytes=s.st_size,
            modified_at=s.st_mtime,
            permissions=mode,
            owner=owner,
            group=group,
            is_symlink=is_sym,
            symlink_target=sym_target,
        )
    except (PermissionError, OSError):
        return None


async def list_directory(path: str) -> DirectoryListing:
    p = Path(path).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError(f"Access to {path} is not allowed")
    if not p.exists():
        raise FileNotFoundError(f"{path} does not exist")
    if not p.is_dir():
        raise NotADirectoryError(f"{path} is not a directory")

    entries: list[FileEntry] = []
    try:
        for child in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            entry = _stat_to_entry(child)
            if entry:
                entries.append(entry)
    except PermissionError:
        pass

    return DirectoryListing(
        path=str(p),
        parent=str(p.parent) if p != p.parent else None,
        entries=entries,
        total=len(entries),
    )


async def read_file(path: str) -> tuple[str, bool]:
    p = Path(path).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError(f"Access to {path} is not allowed")
    if not p.exists():
        raise FileNotFoundError(f"{path} does not exist")
    if p.is_dir():
        raise IsADirectoryError(f"{path} is a directory")

    size = p.stat().st_size
    if size > 10 * 1024 * 1024:
        raise ValueError("File too large to read in browser (max 10MB)")

    try:
        async with aiofiles.open(p, "r", encoding="utf-8", errors="strict") as f:
            content = await f.read()
        return content, False
    except (UnicodeDecodeError, UnicodeError):
        async with aiofiles.open(p, "rb") as f:
            raw = await f.read()
        return raw.hex(), True


async def write_file(path: str, content: str, encoding: str = "utf-8") -> None:
    p = Path(path).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError(f"Access to {path} is not allowed")
    p.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(p, "w", encoding=encoding) as f:
        await f.write(content)


async def delete_path(path: str) -> None:
    p = Path(path).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError(f"Access to {path} is not allowed")
    if not p.exists():
        raise FileNotFoundError(f"{path} does not exist")
    if p.is_dir():
        shutil.rmtree(str(p))
    else:
        p.unlink()


async def rename_path(path: str, new_name: str) -> str:
    p = Path(path).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError(f"Access to {path} is not allowed")
    new_path = p.parent / new_name
    p.rename(new_path)
    return str(new_path)


async def move_path(source: str, destination: str) -> str:
    src = Path(source).resolve()
    dst = Path(destination).resolve()
    if not _is_path_allowed(str(src)) or not _is_path_allowed(str(dst)):
        raise PermissionError("Access not allowed")
    shutil.move(str(src), str(dst))
    return str(dst)


async def copy_path(source: str, destination: str) -> str:
    src = Path(source).resolve()
    dst = Path(destination).resolve()
    if not _is_path_allowed(str(src)) or not _is_path_allowed(str(dst)):
        raise PermissionError("Access not allowed")
    if src.is_dir():
        shutil.copytree(str(src), str(dst))
    else:
        shutil.copy2(str(src), str(dst))
    return str(dst)


async def make_directory(parent: str, name: str) -> str:
    p = (Path(parent) / name).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError("Access not allowed")
    p.mkdir(parents=True, exist_ok=True)
    return str(p)


async def compress_paths(paths: list[str], destination: str, fmt: str) -> str:
    dst = Path(destination).resolve()
    if fmt == "zip":
        with zipfile.ZipFile(str(dst), "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in paths:
                p = Path(path).resolve()
                if p.is_dir():
                    for child in p.rglob("*"):
                        zf.write(str(child), child.relative_to(p.parent))
                else:
                    zf.write(str(p), p.name)
    else:
        mode = "w:bz2" if "bz2" in fmt else "w:gz"
        with tarfile.open(str(dst), mode) as tf:
            for path in paths:
                p = Path(path).resolve()
                tf.add(str(p), arcname=p.name)

    return str(dst)


async def extract_archive(path: str, destination: str) -> str:
    p = Path(path).resolve()
    dst = Path(destination).resolve()
    if not _is_path_allowed(str(p)) or not _is_path_allowed(str(dst)):
        raise PermissionError("Access not allowed")
    dst.mkdir(parents=True, exist_ok=True)

    if zipfile.is_zipfile(str(p)):
        with zipfile.ZipFile(str(p), "r") as zf:
            zf.extractall(str(dst))
    elif tarfile.is_tarfile(str(p)):
        with tarfile.open(str(p), "r:*") as tf:
            tf.extractall(str(dst))
    else:
        raise ValueError("Unsupported archive format")

    return str(dst)


async def set_permissions(path: str, mode_str: str, recursive: bool = False) -> None:
    p = Path(path).resolve()
    if not _is_path_allowed(str(p)):
        raise PermissionError("Access not allowed")
    mode = int(mode_str, 8)
    if recursive and p.is_dir():
        for child in p.rglob("*"):
            child.chmod(mode)
    p.chmod(mode)
