"""Конфігурація підключення до PostgreSQL (async)."""

from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from pydantic_settings import BaseSettings

# Абсолютний шлях: відносний "." прив'язаний до робочої теки, тому запуск
# uvicorn з кореня репозиторію молча брав дефолтний порт 5432 замість 5433.
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    """Зчитує змінні з .env автоматично."""

    DATABASE_URL: str = (
        "postgresql+asyncpg://finance_user:finance_pass@localhost:5432/finance_db"
    )

    # Часовий пояс користувача. Статистика групує транзакції за місцевою
    # добою, інакше витрата о 00:30 потрапила б у попередній день (UTC).
    APP_TIMEZONE: str = "Europe/Kyiv"

    # Ключ для підпису JWT. Значення нижче — лише щоб застосунок запускався
    # «з коробки»; робочий ключ задається в .env (JWT_SECRET).
    JWT_SECRET: str = "dev-only-insecure-change-me"
    JWT_TTL_HOURS: int = 24 * 30

    model_config = {"env_file": ENV_FILE, "extra": "ignore"}


settings = Settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,          # True для дебагу SQL-запитів
    pool_size=5,
    max_overflow=10,
)

async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI Dependency — видає сесію, закриває після запиту."""
    async with async_session() as session:
        yield session
