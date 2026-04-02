import hashlib
import hmac
import os
import secrets


PASSWORD_PEPPER = os.getenv("PASSWORD_PEPPER", "change-this-pepper")


def hash_password(password: str, salt: str | None = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)

    digest = hashlib.sha256(f"{salt}:{password}:{PASSWORD_PEPPER}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, _ = stored_hash.split("$", 1)
    except ValueError:
        return False

    recalculated = hash_password(password, salt)
    return hmac.compare_digest(stored_hash, recalculated)


def create_session_token() -> str:
    return secrets.token_urlsafe(48)