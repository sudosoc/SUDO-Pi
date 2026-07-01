from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified, DBSession
from app.schemas.user import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.audit_service import AuditService
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    _: AdminUser,
    db: DBSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> UserListResponse:
    service = UserService(db)
    users, total = await service.list_users(skip=skip, limit=limit)
    page = skip // limit + 1
    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=limit,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[CsrfVerified])
async def create_user(body: UserCreate, current_user: AdminUser, db: DBSession) -> UserResponse:
    audit = AuditService(db)
    service = UserService(db)
    try:
        user = await service.create_user(body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    await audit.log("user.create", user=current_user, resource=body.username, status_code=201)
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, _: AdminUser, db: DBSession) -> UserResponse:
    service = UserService(db)
    try:
        user = await service.get_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse, dependencies=[CsrfVerified])
async def update_user(user_id: int, body: UserUpdate, current_user: AdminUser, db: DBSession) -> UserResponse:
    audit = AuditService(db)
    service = UserService(db)
    try:
        user = await service.update_user(user_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("user.update", user=current_user, resource=str(user_id), status_code=200)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=[CsrfVerified])
async def delete_user(user_id: int, current_user: AdminUser, db: DBSession) -> None:
    audit = AuditService(db)
    service = UserService(db)
    try:
        await service.delete_user(user_id, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("user.delete", user=current_user, resource=str(user_id), status_code=204)
