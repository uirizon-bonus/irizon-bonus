"""Admin accounts and their login sessions.

Until now the panel had one shared key: everyone who logged in sent the same
`X-Admin-Key`, so every audit row was attributed to the same name and there was
no way to tell who did what. Each admin now has their own account and their own
session token, and the token is what the audit trail resolves to a name.

The token keeps travelling in the `X-Admin-Key` header, so the panel needed no
change — only what the server hands back at login differs.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from contextvars import ContextVar
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from backend.config import ADMIN_USERNAME, logger
from backend.db import bonus_db

SESSION_TTL_DAYS = 30

# Set by the auth dependency at the start of each request so audit writes deep in
# the service layer can name the operator without every function signature
# growing an `actor` parameter.
_current_actor: ContextVar[str] = ContextVar("current_admin_actor", default="")

_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(digest_hex)),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def set_current_actor(actor: str) -> None:
    _current_actor.set(actor or "")


def current_actor() -> str:
    """Who is making the current request, for audit rows and `createdBy`."""
    return _current_actor.get() or ADMIN_USERNAME or "Admin"


def create_user(username: str, password: str, full_name: str = "") -> Dict[str, Any]:
    name = username.strip().lower()
    if not name:
        raise ValueError("Login bo'sh bo'lishi mumkin emas")
    if len(password) < 10:
        raise ValueError("Parol kamida 10 ta belgidan iborat bo'lishi kerak")
    connection = bonus_db()
    try:
        existing = connection.execute(
            "SELECT username FROM admin_users WHERE username = ?", (name,)
        ).fetchone()
        if existing is not None:
            raise ValueError(f"'{name}' allaqachon mavjud")
        connection.execute(
            """
            INSERT INTO admin_users (username, full_name, password_hash, is_active)
            VALUES (?, ?, ?, 1)
            """,
            (name, full_name.strip() or name, hash_password(password)),
        )
        connection.commit()
    finally:
        connection.close()
    logger.info("Admin user created: %s", name)
    return {"username": name, "fullName": full_name.strip() or name}


def set_password(username: str, password: str) -> bool:
    if len(password) < 10:
        raise ValueError("Parol kamida 10 ta belgidan iborat bo'lishi kerak")
    connection = bonus_db()
    try:
        connection.execute(
            "UPDATE admin_users SET password_hash = ? WHERE username = ?",
            (hash_password(password), username.strip().lower()),
        )
        connection.commit()
    finally:
        connection.close()
    return True


def list_users() -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        rows = connection.execute(
            """
            SELECT username, full_name, is_active, created_at, last_login_at
            FROM admin_users ORDER BY username ASC
            """
        ).fetchall()
    finally:
        connection.close()
    return [
        {
            "username": str(row["username"]),
            "fullName": str(row["full_name"] or row["username"]),
            "isActive": bool(row["is_active"]),
            "createdAt": str(row["created_at"] or ""),
            "lastLoginAt": str(row["last_login_at"] or ""),
        }
        for row in rows
    ]


def authenticate(username: str, password: str) -> Optional[Dict[str, Any]]:
    name = username.strip().lower()
    connection = bonus_db()
    try:
        row = connection.execute(
            "SELECT username, full_name, password_hash, is_active FROM admin_users WHERE username = ?",
            (name,),
        ).fetchone()
    finally:
        connection.close()
    if row is None or not bool(row["is_active"]):
        # Still hash something so a missing account does not answer faster than
        # a wrong password.
        verify_password(password, hash_password("dummy-password-placeholder"))
        return None
    if not verify_password(password, str(row["password_hash"])):
        return None
    return {"username": str(row["username"]), "fullName": str(row["full_name"] or row["username"])}


def create_session(username: str, ip: str = "") -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS)).isoformat()
    connection = bonus_db()
    try:
        connection.execute(
            "INSERT INTO admin_sessions (token, username, expires_at, created_ip) VALUES (?, ?, ?, ?)",
            (token, username, expires_at, ip),
        )
        connection.execute(
            "UPDATE admin_users SET last_login_at = ? WHERE username = ?",
            (datetime.utcnow().isoformat(timespec="seconds"), username),
        )
        # Opportunistic cleanup so expired rows do not accumulate forever.
        connection.execute("DELETE FROM admin_sessions WHERE expires_at < ?", (datetime.utcnow().isoformat(),))
        connection.commit()
    finally:
        connection.close()
    return token


def resolve_session(token: str) -> Optional[str]:
    """Return the username behind a session token, or None if it is not valid."""
    if not token:
        return None
    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT s.username AS username, s.expires_at AS expires_at, u.is_active AS is_active
            FROM admin_sessions s
            LEFT JOIN admin_users u ON u.username = s.username
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    finally:
        connection.close()
    if row is None or not bool(row["is_active"]):
        return None
    try:
        if datetime.utcnow() > datetime.fromisoformat(str(row["expires_at"])):
            return None
    except ValueError:
        return None
    return str(row["username"])


def revoke_sessions(username: str) -> int:
    connection = bonus_db()
    try:
        cursor = connection.execute(
            "DELETE FROM admin_sessions WHERE username = ?", (username.strip().lower(),)
        )
        connection.commit()
        return int(getattr(cursor, "rowcount", 0) or 0)
    finally:
        connection.close()


def ensure_env_admin(username: str, password: str) -> None:
    """Move the env-configured admin into the accounts table on first login.

    Without a row here their session token would resolve to nothing — the
    token lookup joins admin_users and treats a missing row as inactive. The
    length rule in create_user is deliberately skipped: this migrates an
    existing credential rather than accepting a new one.
    """
    name = username.strip().lower()
    if not name:
        return
    connection = bonus_db()
    try:
        existing = connection.execute(
            "SELECT username FROM admin_users WHERE username = ?", (name,)
        ).fetchone()
        if existing is not None:
            return
        connection.execute(
            """
            INSERT INTO admin_users (username, full_name, password_hash, is_active)
            VALUES (?, ?, ?, 1)
            """,
            (name, name, hash_password(password)),
        )
        connection.commit()
        logger.info("Admin user migrated from environment: %s", name)
    finally:
        connection.close()
