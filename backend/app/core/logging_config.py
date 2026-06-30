from __future__ import annotations

import sys
from pathlib import Path

from loguru import logger

from app.core.config import settings


def setup_logging() -> None:
    settings.LOG_DIR.mkdir(parents=True, exist_ok=True)

    logger.remove()

    fmt_console = (
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )
    fmt_file = "{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}"

    logger.add(
        sys.stdout,
        format=fmt_console,
        level=settings.LOG_LEVEL,
        colorize=True,
        enqueue=True,
    )

    logger.add(
        settings.LOG_DIR / "app.log",
        format=fmt_file,
        level=settings.LOG_LEVEL,
        rotation=settings.LOG_ROTATION,
        retention=settings.LOG_RETENTION,
        compression="gz",
        enqueue=True,
        encoding="utf-8",
    )

    logger.add(
        settings.LOG_DIR / "error.log",
        format=fmt_file,
        level="ERROR",
        rotation=settings.LOG_ROTATION,
        retention=settings.LOG_RETENTION,
        compression="gz",
        enqueue=True,
        encoding="utf-8",
    )

    logger.add(
        settings.LOG_DIR / "audit.log",
        format=fmt_file,
        level="INFO",
        filter=lambda record: record["extra"].get("audit") is True,
        rotation=settings.LOG_ROTATION,
        retention="90 days",
        compression="gz",
        enqueue=True,
        encoding="utf-8",
    )

    logger.info("Logging initialized. Level={} Dir={}", settings.LOG_LEVEL, settings.LOG_DIR)
