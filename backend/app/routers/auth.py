"""Реєстрація, вхід та дані поточного акаунта."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import Transaction, User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Створити акаунт",
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Створює акаунт і одразу повертає токен.

    Перший акаунт у системі забирає собі транзакції без власника — ті, що
    були створені до появи користувачів, щоб вони не загубились.
    """
    is_first_user = (await db.execute(select(func.count(User.id)))).scalar_one() == 0

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

    if is_first_user:
        await db.execute(
            update(Transaction).where(Transaction.user_id.is_(None)).values(user_id=user.id)
        )

    await db.commit()
    await db.refresh(user)
    return AuthResponse(access_token=create_token(user.id), user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse, summary="Увійти")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Перевіряє пароль і повертає токен."""
    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    # Однаковий текст для невідомого email і невірного пароля, щоб не
    # підказувати, які акаунти існують.
    # bcrypt навмисно повільний (~250 мс), тому рахуємо його в потоці.
    password_ok = user is not None and await run_in_threadpool(
        verify_password, payload.password, user.password_hash
    )
    if not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль",
        )
    return AuthResponse(access_token=create_token(user.id), user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead, summary="Поточний акаунт")
async def me(user: User = Depends(get_current_user)) -> User:
    """Дає перевірити, що збережений токен ще дійсний."""
    return user
