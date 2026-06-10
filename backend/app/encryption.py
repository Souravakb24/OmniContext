import hmac
import hashlib
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings


def generate_username_hash(username: str) -> str:
    return hmac.new(
        settings.HASH_SECRET.encode(),
        username.lower().encode(),
        hashlib.sha256
    ).hexdigest()


def encrypt_value(db: Session, value: str) -> bytes:
    result = db.execute(
        text("SELECT pgp_sym_encrypt(:val, :key)"),
        {"val": value, "key": settings.ENCRYPTION_KEY}
    ).scalar()
    return result


def decrypt_value(db: Session, encrypted: bytes) -> str:
    result = db.execute(
        text("SELECT pgp_sym_decrypt(:enc, :key)"),
        {"enc": encrypted, "key": settings.ENCRYPTION_KEY}
    ).scalar()
    return result
