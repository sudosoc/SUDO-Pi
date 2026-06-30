from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from loguru import logger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import create_tables
from app.core.logging_config import setup_logging
from app.services.auth_service import AuthService
from app.core.database import AsyncSessionFactory
from app.websockets.system_ws import start_metrics_broadcaster


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting {} v{} ({})", settings.APP_NAME, settings.APP_VERSION, settings.APP_ENV)

    Path(settings.LOG_DIR).mkdir(parents=True, exist_ok=True)
    (Path(settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "")).parent).mkdir(parents=True, exist_ok=True)

    await create_tables()

    async with AsyncSessionFactory() as db:
        auth_service = AuthService(db)
        await auth_service.ensure_admin_exists()
        await db.commit()

    await start_metrics_broadcaster()
    logger.info("{} startup complete. Listening...", settings.APP_NAME)

    yield

    logger.info("{} shutting down", settings.APP_NAME)


limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_API])

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Raspberry Pi 5 Headless Management System",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "X-Page", "X-Page-Size"],
)

if settings.is_production:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["sudo.local", "sudo-pi.local", "192.168.4.1", "localhost", "127.0.0.1"],
    )


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"

    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000

    if not request.url.path.startswith("/api/v1/system/ws") and not request.url.path.startswith("/api/v1/terminal"):
        logger.debug(
            "{} {} {} {:.1f}ms",
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
        )
    return response


app.include_router(api_router)

_FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> Response:
        index = _FRONTEND_DIST / "index.html"
        if index.exists():
            return Response(content=index.read_text(), media_type="text/html")
        return JSONResponse({"detail": "Frontend not built"}, status_code=503)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}
