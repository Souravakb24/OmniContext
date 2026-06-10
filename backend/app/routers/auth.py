from app import crud
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.auth import verify_password, create_access_token
from app.encryption import generate_username_hash
from app import schemas

router = APIRouter(prefix="/api/auth", tags=["auth"])

bearer_scheme = HTTPBearer()


@router.post("/login", response_model=schemas.LoginResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    org = crud.find_org_by_name(db, body.org_name)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    username_hash = generate_username_hash(body.username)
    user = crud.get_user_by_username_hash(db, org.id, username_hash)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not verify_password(body.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "user_id": str(user.id),
        "org_id": str(user.org_id),
        "role": user.role,
    })
    crud.create_session(db, user.id, token)

    return schemas.LoginResponse(
        access_token=token,
        user_id=user.id,
        org_id=user.org_id,
        role=user.role,
    )


@router.post("/logout", response_model=schemas.MessageResponse)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crud.delete_session_by_token(db, credentials.credentials)
    return schemas.MessageResponse(message="Logged out successfully")
