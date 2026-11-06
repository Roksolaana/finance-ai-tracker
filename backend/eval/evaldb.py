"""Окрема база для оцінки, заповнена з eval/fixture.json.

Так само, як тести: свіжа база `finance_eval` у тому ж контейнері, схема —
тими самими міграціями, що й у застосунку. Робоча `finance_db` не
чіпається, а результат не залежить від того, що в кого в ній лежить.
"""

import asyncio
import datetime
import json
import uuid
from collections.abc import Callable
from pathlib import Path
from zoneinfo import ZoneInfo

import asyncpg
from sqlalchemy import make_url, pool
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.auth import hash_password
from app.database import settings
from app.embeddings import embed
from app.migrate import upgrade_to_head
from app.models import BudgetHistory, Transaction, User

FIXTURE = Path(__file__).with_name("fixture.json")
EVAL_DB = "finance_eval"
EVAL_EMAIL = "eval@krona.local"


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _raw_dsn(url) -> str:
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


def eval_url(name: str = EVAL_DB):
    return make_url(settings.DATABASE_URL).set(database=name)


def prepare_database(name: str = EVAL_DB) -> None:
    """Перестворює базу оцінки й доводить схему до останньої міграції.

    Синхронна: Alembic сам запускає event loop, тож викликати до asyncio.run.
    Назву можна змінити, щоб паралельні прогони різних моделей не
    перестворювали базу одне одному посеред роботи.
    """
    main_url = make_url(settings.DATABASE_URL)

    async def recreate() -> None:
        conn = await asyncpg.connect(_raw_dsn(main_url))
        try:
            await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            await conn.execute(f'CREATE DATABASE "{name}"')
        finally:
            await conn.close()

    asyncio.run(recreate())
    real_url = settings.DATABASE_URL
    settings.DATABASE_URL = eval_url(name).render_as_string(hide_password=False)
    try:
        upgrade_to_head()
    finally:
        settings.DATABASE_URL = real_url


async def fill(
    session: AsyncSession,
    data: dict,
    embed_texts: Callable[[list[str]], list[list[float]]] = embed,
) -> uuid.UUID:
    """Записує фікстуру в базу від імені окремого акаунта; повертає його id."""
    tz = ZoneInfo(data["timezone"])
    user = User(email=EVAL_EMAIL, password_hash=hash_password("eval-password"), display_name="Оцінка")
    session.add(user)
    await session.flush()

    # Кожну різну нотатку кодуємо один раз — так само, як її закодував би
    # застосунок при збереженні транзакції.
    notes = sorted({row["note"] for row in data["transactions"] if row["note"]})
    vectors = dict(zip(notes, embed_texts(notes)))

    session.add_all(
        Transaction(
            user_id=user.id,
            amount=row["amount"],
            category=row["category"],
            spent_at=datetime.datetime.fromisoformat(row["spent_at"]).replace(tzinfo=tz),
            note=row["note"],
            embedding=vectors.get(row["note"]),
        )
        for row in data["transactions"]
    )
    session.add_all(
        BudgetHistory(
            user_id=user.id,
            category=row["category"],
            valid_from=datetime.date.fromisoformat(row["valid_from"]),
            monthly_limit=row["monthly_limit"],
        )
        for row in data["budgets"]
    )
    await session.commit()
    return user.id


async def open_eval_db(name: str = EVAL_DB) -> tuple[AsyncEngine, async_sessionmaker, uuid.UUID]:
    """Двигун і сесії до вже підготовленої бази, заповненої фікстурою."""
    engine = create_async_engine(eval_url(name), poolclass=pool.NullPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        user_id = await fill(session, load_fixture())
    return engine, sessions, user_id
