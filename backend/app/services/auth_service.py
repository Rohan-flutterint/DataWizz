from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.auth import User, UserSession


class AuthService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._iterations = 390000

    def hash_password(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, self._iterations)
        return "pbkdf2_sha256${iterations}${salt}${digest}".format(
            iterations=self._iterations,
            salt=base64.b64encode(salt).decode("ascii"),
            digest=base64.b64encode(digest).decode("ascii"),
        )

    def verify_password(self, password: str, password_hash: str) -> bool:
        try:
            algorithm, iterations, salt_b64, digest_b64 = password_hash.split("$", 3)
        except ValueError:
            return False
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(digest_b64.encode("ascii"))
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(digest, expected)

    def create_session(self, db: Session, user: User) -> tuple[UserSession, str]:
        token = secrets.token_urlsafe(48)
        session = UserSession(
            user_id=user.id,
            token_hash=self._hash_token(token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=self.settings.auth_session_ttl_hours),
            last_used_at=datetime.now(timezone.utc),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session, token

    def get_session_for_token(self, db: Session, token: str) -> UserSession | None:
        session = db.query(UserSession).filter(UserSession.token_hash == self._hash_token(token)).one_or_none()
        if session is None:
            return None
        if session.revoked_at is not None:
            return None
        expires_at = self._coerce_utc(session.expires_at)
        if expires_at <= datetime.now(timezone.utc):
            return None
        session.last_used_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)
        return session

    def revoke_session(self, db: Session, token: str) -> None:
        session = db.query(UserSession).filter(UserSession.token_hash == self._hash_token(token)).one_or_none()
        if session is None or session.revoked_at is not None:
            return
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()

    def authenticate_user(self, db: Session, email: str, password: str) -> User | None:
        user = db.query(User).filter(User.email == email.strip().lower()).one_or_none()
        if user is None or not user.is_active:
            return None
        if not self.verify_password(password, user.password_hash):
            return None
        return user

    def ensure_seed_users(self, db: Session) -> None:
        seeds = [
            {
                "name": self.settings.demo_admin_name,
                "email": self.settings.demo_admin_email.lower(),
                "password": self.settings.demo_admin_password,
                "role": "admin",
            },
            {
                "name": self.settings.demo_analyst_name,
                "email": self.settings.demo_analyst_email.lower(),
                "password": self.settings.demo_analyst_password,
                "role": "analyst",
            },
            {
                "name": self.settings.demo_viewer_name,
                "email": self.settings.demo_viewer_email.lower(),
                "password": self.settings.demo_viewer_password,
                "role": "viewer",
            },
        ]
        changed = False
        for seed in seeds:
            user = db.query(User).filter(User.email == seed["email"]).one_or_none()
            if user is None:
                db.add(
                    User(
                        name=seed["name"],
                        email=seed["email"],
                        password_hash=self.hash_password(seed["password"]),
                        role=seed["role"],
                        is_active=True,
                    )
                )
                changed = True
                continue
            if user.role != seed["role"]:
                user.role = seed["role"]
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
        if changed:
            db.commit()

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _coerce_utc(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


auth_service = AuthService()
