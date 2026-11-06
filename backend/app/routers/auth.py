"""Реєстрація, вхід, дані поточного акаунта й керування ним."""

import math

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.ratelimit import RateLimiter, too_many_requests
from app.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    UserRead,
)

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
    return AuthResponse(access_token=create_token(user), user=UserRead.model_validate(user))


def _client_address(request: Request) -> str:
    # Адреса самого зʼєднання, а не X-Forwarded-For: сервер стоїть без
    # проксі, а заголовок клієнт підставляє будь-який — і з ним кожна
    # спроба мала б «нову» адресу.
    return request.client.host if request.client else "unknown"


def _attempt_key(email: str, request: Request) -> tuple[str, str]:
    # Ключ — пара (email, адреса): за самим email чужий скрипт міг би
    # заблокувати вхід справжньому власнику, а за самою адресою — усім
    # у спільній Wi-Fi мережі гуртожитку.
    return email, _client_address(request)


def _check_attempts(key: tuple[str, str]) -> None:
    retry_after = _failed_logins.retry_after(key, LOGIN_ATTEMPTS)
    if retry_after is not None:
        raise too_many_requests(
            f"Забагато невдалих спроб входу. Спробуйте через {math.ceil(retry_after / 60)} хв",
            retry_after,
        )


async def _password_matches(key: tuple[str, str], password: str, password_hash: str | None) -> bool:
    """Перевіряє пароль і веде лічильник невдалих спроб.

    Той самий лічильник для входу, зміни пароля й видалення акаунта: інакше
    з украденим токеном поточний пароль можна було б підбирати без обмежень
    через «Змінити пароль».
    """
    # bcrypt навмисно повільний (~250 мс), тому рахуємо його в потоці.
    ok = password_hash is not None and await run_in_threadpool(verify_password, password, password_hash)
    if ok:
        # Рахуємо невдалі спроби поспіль, а не за вікно взагалі: хто кілька
        # разів помилився й зрештою ввів правильно, не має чекати наступного разу.
        _failed_logins.reset(key)
    else:
        _failed_logins.record(key)
    return ok


@router.post("/login", response_model=AuthResponse, summary="Увійти")
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Перевіряє пароль і повертає токен."""
    key = _attempt_key(payload.email, request)
    _check_attempts(key)

    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    # Однаковий текст для невідомого email і невірного пароля, щоб не
    # підказувати, які акаунти існують.
    if not await _password_matches(key, payload.password, user.password_hash if user else None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль",
        )
    return AuthResponse(access_token=create_token(user), user=UserRead.model_validate(user))


async def _confirm_password(user: User, password: str, request: Request) -> None:
    """Підтвердження паролем для небезпечних дій з акаунтом.

    400, а не 401: на 401 з токеном клієнт вважає сесію недійсною й виходить
    з акаунта, хоча людина просто помилилась у полі.
    """
    key = _attempt_key(user.email, request)
    _check_attempts(key)
    if not await _password_matches(key, password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Невірний поточний пароль")


@router.post("/change-password", response_model=AuthResponse, summary="Змінити пароль")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AuthResponse:
    """Міняє пароль і відкликає всі видані токени.

    Пароль змінюють найчастіше саме тоді, коли підозрюють, що його знає хтось
    інший, — тож чужі сесії мають закритися разом зі старим паролем. Новий
    токен повертаємо, щоб пристрій, з якого змінили пароль, лишився в акаунті.
    """
    await _confirm_password(user, payload.current_password, request)
    user.password_hash = await run_in_threadpool(hash_password, payload.new_password)
    user.token_version += 1
    await db.commit()
    await db.refresh(user)
    return AuthResponse(access_token=create_token(user), user=UserRead.model_validate(user))


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT, summary="Вийти на всіх пристроях")
async def logout_all(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Відкликає всі токени, включно з поточним."""
    # Інкремент у самій базі: два одночасні запити не мають дати ту саму версію.
    await db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version + 1))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead, summary="Поточний акаунт")
async def me(user: User = Depends(get_current_user)) -> User:
    """Дає перевірити, що збережений токен ще дійсний."""
    return user



@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, summary="Видалити акаунт")
async def delete_me(
    payload: DeleteAccountRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Видаляє акаунт разом з усіма даними.

    Транзакції, ліміти, їхня історія й розмова з асистентом привʼязані до
    users з ON DELETE CASCADE, тож база прибирає їх сама в тій самій
    транзакції — частково видалений акаунт лишитися не може.
    """
    await _confirm_password(user, payload.password, request)
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
