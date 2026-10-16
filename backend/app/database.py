"""Конфігурація підключення до PostgreSQL (async)."""

import secrets
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

    # Ключ підпису JWT. Дефолтного значення навмисно немає: зі спільним
    # відомим ключем будь-хто підписав би токен на чужий user_id, і поділ
    # даних між акаунтами став би декоративним. Порожній ключ заповнюється
    # випадковим при старті (див. ensure_jwt_secret нижче).
    JWT_SECRET: str = ""
    JWT_TTL_HOURS: int = 24 * 30

    # LLM для AI-чату. Порожній ключ = чат вимкнений, решта застосунку працює.
    GROQ_API_KEY: str = ""
    # API Groq сумісний з OpenAI, тому базову адресу й модель винесено в
    # налаштування — зміна провайдера не потребує правок у коді.
    LLM_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL: str = "openai/gpt-oss-120b"

    model_config = {"env_file": ENV_FILE, "extra": "ignore"}


settings = Settings()


def ensure_jwt_secret() -> bool:
    """Гарантує, що ключ підпису існує і він унікальний для цієї установки.

    Якщо ключа немає — генерує випадковий і дописує в `.env`, щоб токени
    пережили перезапуск. Так застосунок працює одразу після клонування, але
    спільного «відомого» ключа, яким можна підробити чужий токен, не існує.

    Повертає True, якщо ключ довелося згенерувати.
    """
    if settings.JWT_SECRET:
        return False

    settings.JWT_SECRET = secrets.token_urlsafe(48)
    try:
        existing = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
        prefix = "" if existing.endswith("\n") or not existing else "\n"
        with ENV_FILE.open("a", encoding="utf-8") as handle:
            handle.write(f"{prefix}\n# Згенеровано автоматично при першому запуску\nJWT_SECRET={settings.JWT_SECRET}\n")
    except OSError as exc:
        # Записати не вдалося — працюємо з ключем у памʼяті. Єдиний наслідок:
        # після перезапуску доведеться увійти знову.
        raise JwtSecretNotPersisted(str(exc)) from exc
    return True


class JwtSecretNotPersisted(RuntimeError):
    """Ключ згенеровано, але не збережено — сесії не переживуть перезапуск."""

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
