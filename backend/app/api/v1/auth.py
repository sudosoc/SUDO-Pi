from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.dependencies import ActiveUser, CsrfVerified, DBSession
from app.core.security import (
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    set_auth_cookies,
)
from app.schemas.auth import AuthResponse, ChangePasswordRequest, LoginRequest, RefreshResponse, UserInfoResponse
from app.services.audit_service import AuditService
from app.services.auth_service import AuthError, AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/login", response_model=AuthResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: DBSession,
) -> AuthResponse:
    ip = request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For") or request.client.host if request.client else None
    service = AuthService(db)
    audit = AuditService(db)

    try:
        user, access_token, refresh_token, csrf_token = await service.authenticate(
            body.username, body.password, ip_address=ip
        )
    except AuthError as exc:
        await audit.log(
            "auth.login.failed",
            resource=body.username,
            ip_address=ip,
            status_code=exc.status_code,
            details=exc.message,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    secure = settings.is_production
    set_auth_cookies(response, access_token, refresh_token, csrf_token, secure=secure)

    await audit.log(
        "auth.login.success",
        user=user,
        resource="session",
        ip_address=ip,
        status_code=200,
    )

    return AuthResponse(
        user=UserInfoResponse.model_validate(user),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        csrf_token=csrf_token,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    db: DBSession,
    refresh_token: str | None = Cookie(alias=REFRESH_COOKIE_NAME, default=None),
) -> RefreshResponse:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    ip = request.client.host if request.client else None
    service = AuthService(db)

    try:
        new_access, new_refresh, csrf_token = await service.refresh_tokens(refresh_token, ip_address=ip)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    secure = settings.is_production
    set_auth_cookies(response, new_access, new_refresh, csrf_token, secure=secure)

    return RefreshResponse(
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        csrf_token=csrf_token,
    )


@router.post("/logout", dependencies=[CsrfVerified])
async def logout(
    request: Request,
    response: Response,
    current_user: ActiveUser,
    db: DBSession,
    refresh_token: str | None = Cookie(alias=REFRESH_COOKIE_NAME, default=None),
) -> dict:
    ip = request.client.host if request.client else None
    service = AuthService(db)
    audit = AuditService(db)

    if refresh_token:
        await service.logout(refresh_token)

    secure = settings.is_production
    clear_auth_cookies(response, secure=secure)

    await audit.log("auth.logout", user=current_user, ip_address=ip, status_code=200)
    return {"detail": "Logged out successfully"}


@router.post("/logout-all", dependencies=[CsrfVerified])
async def logout_all(
    request: Request,
    response: Response,
    current_user: ActiveUser,
    db: DBSession,
) -> dict:
    service = AuthService(db)
    await service.logout_all(current_user.id)
    secure = settings.is_production
    clear_auth_cookies(response, secure=secure)
    return {"detail": "All sessions terminated"}


@router.get("/me", response_model=UserInfoResponse)
async def me(current_user: ActiveUser) -> UserInfoResponse:
    return UserInfoResponse.model_validate(current_user)


@router.post("/change-password", dependencies=[CsrfVerified])
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: ActiveUser,
    db: DBSession,
) -> dict:
    service = AuthService(db)
    audit = AuditService(db)
    try:
        await service.change_password(current_user, body.current_password, body.new_password)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    ip = request.client.host if request.client else None
    await audit.log("auth.password.changed", user=current_user, ip_address=ip, status_code=200)
    return {"detail": "Password changed successfully"}
