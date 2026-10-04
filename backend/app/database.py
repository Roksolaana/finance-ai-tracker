"""Конфігурація підключення до PostgreSQL (async)."""

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Зчитує змінні з .env автоматично."""

    DATABASE_URL: str = (
        "postgresql+asyncpg://finance_user:finance_pass@localhost:5432/finance_db"
    )

    model_config = {"env_file": ".env", "extra": "ignore"}


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
