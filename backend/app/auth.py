import hashlib
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRES_MINUTES)
    return jwt.encode({**data, "exp": expire}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_super_admin_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRES_MINUTES)
    return jwt.encode({**data, "exp": expire, "type": "super_admin"}, settings.SUPER_ADMIN_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_super_admin_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SUPER_ADMIN_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != "super_admin":
        raise JWTError("Not a super admin token")
    return payload
