"""Автентифікація: хешування паролів, JWT-токени, поточний користувач."""

import datetime
import uuid

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, settings
from app.models import User

ALGORITHM = "HS256"

# auto_error=False — щоб на відсутній токен віддати власний текст помилки.
bearer = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Потрібно увійти в акаунт",
    headers={"WWW-Authenticate": "Bearer"},
)


def hash_password(password: str) -> str:
    # bcrypt обрізає пароль на 72 байтах, тому довші просто не дають переваги.
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], password_hash.encode())
    except ValueError:
        # Пошкоджений або чужий формат хеша — вважаємо пароль невірним.
        return False


def create_token(user: User) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": str(user.id),
        "ver": user.token_version,
        "iat": now,
        "exp": now + datetime.timedelta(hours=settings.JWT_TTL_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Дістає користувача з токена. Кидає 401, якщо токен відсутній чи невалідний."""
    if credentials is None:
        raise CREDENTIALS_ERROR
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[ALGORITHM])
        user_id = uuid.UUID(payload["sub"])
        # Токени, видані до появи версій, не мають `ver` — це версія 0. Вони
        # діють, поки акаунт нічого не відкликав, тож оновлення сервера
        # нікого не викидає з акаунта.
        version = int(payload.get("ver", 0))
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        raise CREDENTIALS_ERROR

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        # Токен підписаний правильно, але акаунт уже видалено.
        raise CREDENTIALS_ERROR
    if version != user.token_version:
        # Після зміни пароля чи «вийти на всіх пристроях».
        raise CREDENTIALS_ERROR
    return user
