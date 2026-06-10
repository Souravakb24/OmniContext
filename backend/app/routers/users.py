from app import crud
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import User
from app.encryption import decrypt_value, generate_username_hash
from app import schemas

router = APIRouter(prefix="/api", tags=["users"])


@router.post("/org/user/register", response_model=schemas.UserRegisterResponse, status_code=201)
def register_user(body: schemas.UserRegisterRequest, db: Session = Depends(get_db)):
    org = crud.find_org_by_name(db, body.org_name)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    limits = crud.get_org_limits(db, org.id)
    active_count = crud.count_active_users(db, org.id)
    if active_count >= limits.max_users:
        raise HTTPException(status_code=429, detail="User limit reached for this organisation")

    username_hash = generate_username_hash(body.username)
    existing = crud.get_user_by_username_hash(db, org.id, username_hash)
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken in this organisation")

    total = crud.count_all_users(db, org.id)
    role = "admin" if total == 0 else "member"

    user = crud.create_user(db, org.id, body.username, body.password, role)
    return schemas.UserRegisterResponse(
        user_id=user.id,
        username=body.username,
        org_id=org.id,
        role=role,
    )


@router.get("/user/me", response_model=schemas.UserProfileResponse)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    username = decrypt_value(db, current_user.username_encrypted)
    org = crud.get_org_by_id(db, current_user.org_id)
    org_name = decrypt_value(db, org.name_encrypted)
    return schemas.UserProfileResponse(
        user_id=current_user.id,
        username=username,
        org_id=current_user.org_id,
        org_name=org_name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )


@router.get("/org/users", response_model=list[schemas.UserListItem])
def list_org_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    users = crud.list_users(db, current_user.org_id)
    return [schemas.UserListItem(**u) for u in users]


@router.patch("/org/user/promote", response_model=schemas.MessageResponse)
def promote_user(
    body: schemas.UsernameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if current_user.username_hash == generate_username_hash(body.username):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    username_hash = generate_username_hash(body.username)
    user = crud.get_user_by_username_hash(db, current_user.org_id, username_hash)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organisation")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="User is already an admin")

    crud.set_user_role(db, user, "admin")
    return schemas.MessageResponse(message=f"User '{body.username}' promoted to admin successfully")


@router.patch("/org/user/demote", response_model=schemas.MessageResponse)
def demote_user(
    body: schemas.UsernameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if current_user.username_hash == generate_username_hash(body.username):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    username_hash = generate_username_hash(body.username)
    user = crud.get_user_by_username_hash(db, current_user.org_id, username_hash)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organisation")
    if user.role == "member":
        raise HTTPException(status_code=400, detail="User is already a member")

    crud.set_user_role(db, user, "member")
    crud.delete_all_sessions_for_user(db, user.id)
    return schemas.MessageResponse(message=f"User '{body.username}' demoted to member successfully")


@router.patch("/org/user/deactivate", response_model=schemas.MessageResponse)
def deactivate_user(
    body: schemas.UsernameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if current_user.username_hash == generate_username_hash(body.username):
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    username_hash = generate_username_hash(body.username)
    user = crud.get_user_by_username_hash(db, current_user.org_id, username_hash)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organisation")

    crud.set_user_active(db, user, False)
    crud.delete_all_sessions_for_user(db, user.id)
    return schemas.MessageResponse(message=f"User '{body.username}' deactivated successfully")


@router.patch("/org/user/activate", response_model=schemas.MessageResponse)
def activate_user(
    body: schemas.UsernameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    username_hash = generate_username_hash(body.username)
    user = crud.get_user_by_username_hash(db, current_user.org_id, username_hash)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organisation")

    crud.set_user_active(db, user, True)
    return schemas.MessageResponse(message=f"User '{body.username}' activated successfully")
