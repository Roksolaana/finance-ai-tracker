"""Реєстрація, вхід та дані поточного акаунта."""

import math

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.ratelimit import RateLimiter, too_many_requests
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])

# 5 невдалих спроб за 15 хвилин. Людині, що забула пароль, цього вистачає,
# щоб перебрати свої звичні варіанти, а перебір словником сповільнюється
# до 20 паролів на годину.
LOGIN_ATTEMPTS = 5
LOGIN_WINDOW = 15 * 60.0
_failed_logins = RateLimiter(window=LOGIN_WINDOW)


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Створити акаунт",
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Створює акаунт і одразу повертає токен."""
    user = User(
        email=payload.email,
        password_hash=await run_in_threadpool(hash_password, payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Акаунт з таким email уже існує",
        )

    await db.commit()
    await db.refresh(user)
    return AuthResponse(access_token=create_token(user.id), user=UserRead.model_validate(user))


def _client_address(request: Request) -> str:
    # Адреса самого зʼєднання, а не X-Forwarded-For: сервер стоїть без
    # проксі, а заголовок клієнт підставляє будь-який — і з ним кожна
    # спроба мала б «нову» адресу.
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=AuthResponse, summary="Увійти")
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Перевіряє пароль і повертає токен."""
    # Ключ — пара (email, адреса): за самим email чужий скрипт міг би
    # заблокувати вхід справжньому власнику, а за самою адресою — усім
    # у спільній Wi-Fi мережі гуртожитку.
    attempt_key = (payload.email, _client_address(request))
    retry_after = _failed_logins.retry_after(attempt_key, LOGIN_ATTEMPTS)
    if retry_after is not None:
        raise too_many_requests(
            f"Забагато невдалих спроб входу. Спробуйте через {math.ceil(retry_after / 60)} хв",
            retry_after,
        )

    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    # Однаковий текст для невідомого email і невірного пароля, щоб не
    # підказувати, які акаунти існують.
    # bcrypt навмисно повільний (~250 мс), тому рахуємо його в потоці.
    password_ok = user is not None and await run_in_threadpool(
        verify_password, payload.password, user.password_hash
    )
    if not password_ok:
        _failed_logins.record(attempt_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль",
        )
    # Рахуємо невдалі спроби поспіль, а не за вікно взагалі: хто кілька разів
    # помилився й зрештою ввів правильно, не має чекати наступного разу.
    _failed_logins.reset(attempt_key)
    return AuthResponse(access_token=create_token(user.id), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead, summary="Поточний акаунт")
async def me(user: User = Depends(get_current_user)) -> User:
    """Дає перевірити, що збережений токен ще дійсний."""
    return user
