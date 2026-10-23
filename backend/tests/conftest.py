"""Спільні фікстури тестів.

Тести ходять у справжній PostgreSQL з pgvector (той самий контейнер), але в
окрему базу `finance_test`: SQLite тут не підходить — схема тримається на
vector, JSONB і timezone() з Postgres. Робочу `finance_db` тести не чіпають.
"""

import asyncio
import os

# Межі місяців у тестах розраховані на київський час, тож пояс фіксуємо до
# імпорту застосунку — timeutils читає його один раз при імпорті.
os.environ["APP_TIMEZONE"] = "Europe/Kyiv"

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, pool, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import get_db, settings
from app.main import app
from app.migrate import upgrade_to_head

TEST_DB = "finance_test"
MAIN_URL = make_url(settings.DATABASE_URL)
TEST_URL = MAIN_URL.set(database=TEST_DB)


def _raw_dsn(url) -> str:
    """DSN для asyncpg без префікса драйвера SQLAlchemy."""
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


async def _recreate(drop_only: bool = False) -> None:
    # CREATE/DROP DATABASE не можна виконати з самої тестової бази, тому
    # підключаємось до основної — лише для цих двох команд.
    conn = await asyncpg.connect(_raw_dsn(MAIN_URL))
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
        if not drop_only:
            await conn.execute(f'CREATE DATABASE "{TEST_DB}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def test_database():
    """Свіжа база на весь прогін, схема — через ті самі міграції, що й у застосунку."""
    asyncio.run(_recreate())
    real_url = settings.DATABASE_URL
    # migrations/env.py бере адресу з settings у момент запуску.
    settings.DATABASE_URL = TEST_URL.render_as_string(hide_password=False)
    if not settings.JWT_SECRET:
        settings.JWT_SECRET = "test-secret"
    try:
        upgrade_to_head()
        yield
    finally:
        settings.DATABASE_URL = real_url
        asyncio.run(_recreate(drop_only=True))


@pytest.fixture(scope="session")
async def sessionmaker(test_database):
    # NullPool: зʼєднання не переживають тест, тож не залежать від event loop.
    engine = create_async_engine(TEST_URL, poolclass=pool.NullPool)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables(sessionmaker):
    """Кожен тест починає з порожніх таблиць."""
    yield
    async with sessionmaker() as session:
        await session.execute(text("TRUNCATE users, transactions, budgets, chat_messages CASCADE"))
        await session.commit()


@pytest.fixture(autouse=True)
def no_embeddings(monkeypatch):
    # Модель вантажиться кілька секунд, а для цих тестів вектор не важливий.
    monkeypatch.setattr("app.routers.transactions.embed_one", lambda text: None)


@pytest.fixture
async def db(sessionmaker):
    """Сесія для прямих вставок і перевірок повз API."""
    async with sessionmaker() as session:
        yield session


@pytest.fixture
async def client(sessionmaker):
    async def override_get_db():
        async with sessionmaker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    # ASGITransport не запускає lifespan — міграції на робочу базу не підуть.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


async def register(client: AsyncClient, email: str) -> tuple[dict, str]:
    """Створює акаунт і повертає заголовки авторизації та id користувача."""
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "display_name": email.split("@")[0]},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]


@pytest.fixture
async def alice(client):
    return await register(client, "alice@example.com")


@pytest.fixture
async def bob(client):
    return await register(client, "bob@example.com")
