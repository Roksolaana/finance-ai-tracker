"""Гібридний інструмент, ліміти для асистента й поведінка старту при проблемах з базою."""

import datetime
import math
import uuid

import pytest
from alembic.util import CommandError
from sqlalchemy import text

from app import main
from app.database import settings
from app.migrate import DatabaseUnavailable, upgrade_to_head
from app.models import Base, Budget, Transaction
from app.tools import ToolArgumentError, check_budgets, hybrid_search_and_sum

OCTOBER = datetime.datetime(2026, 10, 10, 12, tzinfo=datetime.timezone.utc)


def vector(similarity: float) -> list[float]:
    """Вектор із заданою косинусною схожістю до vector(1.0)."""
    return [similarity, math.sqrt(1 - similarity**2)] + [0.0] * 382


async def test_hybrid_counts_only_expenses(db, monkeypatch, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    # Схожість задано векторами: саме такий збіг пошук давав на реальних
    # даних — дохід «Стипендія за місяць» проходив поріг поруч зі стресом.
    stress = Transaction(
        user_id=owner, amount=-390, category="покупки", spent_at=OCTOBER, note="Косметика, щоб зняти стрес", embedding=vector(0.6)
    )
    grant = Transaction(
        user_id=owner, amount=2918, category="дохід", spent_at=OCTOBER, note="Стипендія за місяць", embedding=vector(0.55)
    )
    db.add_all([stress, grant])
    await db.commit()

    monkeypatch.setattr("app.search.embed_one", lambda text: vector(1.0))

    outcome = await hybrid_search_and_sum(db, owner, "витрати через стрес цього місяця", "2026-10-01", "2026-10-31")

    assert outcome.payload["total"] == 390
    assert outcome.payload["count"] == 1
    assert outcome.payload["matched_notes"] == ["Косметика, щоб зняти стрес"]
    assert [t.id for t in outcome.transactions] == [stress.id]


async def test_check_budgets_finds_overspent_category(db, alice, bob):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    _, bob_id = bob
    september = datetime.datetime(2026, 9, 10, 12, tzinfo=datetime.timezone.utc)
    db.add_all(
        [
            Budget(user_id=owner, category="кафе", monthly_limit=3000),
            Budget(user_id=owner, category="їжа", monthly_limit=10000),
            Transaction(user_id=owner, amount=-3280, category="кафе", spent_at=OCTOBER),
            Transaction(user_id=owner, amount=-8740, category="їжа", spent_at=OCTOBER),
            # Не мають потрапити в жовтень: інший місяць, дохід і чужий акаунт.
            Transaction(user_id=owner, amount=-5000, category="кафе", spent_at=september),
            Transaction(user_id=owner, amount=500, category="кафе", spent_at=OCTOBER),
            Transaction(user_id=uuid.UUID(bob_id), amount=-9000, category="кафе", spent_at=OCTOBER),
        ]
    )
    await db.commit()

    outcome = await check_budgets(db, owner, "2026-10")

    assert outcome.kind == "sql"
    assert outcome.payload["over_limit"] == ["кафе"]
    cafe, food = outcome.payload["budgets"]
    assert cafe == {"category": "кафе", "limit": 3000, "spent": 3280, "left": 0, "over_by": 280, "used_percent": 109}
    assert food["left"] == 1260 and food["over_by"] == 0


async def test_check_budgets_without_limits(db, alice):
    _, user_id = alice
    outcome = await check_budgets(db, uuid.UUID(user_id), "2026-10")
    assert outcome.payload["budgets"] == []
    with pytest.raises(ToolArgumentError):
        await check_budgets(db, uuid.UUID(user_id), "жовтень")


def test_unreachable_database_is_reported_separately(monkeypatch):
    # Порт, на якому гарантовано нічого не слухає.
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql+asyncpg://user:pass@127.0.0.1:1/none")
    with pytest.raises(DatabaseUnavailable):
        upgrade_to_head()


async def _start(monkeypatch, error: Exception):
    def failing_upgrade():
        raise error

    monkeypatch.setattr(main, "upgrade_to_head", failing_upgrade)
    monkeypatch.setattr(main, "embed_one", lambda text: None)
    async with main.lifespan(main.app):
        pass


async def test_startup_continues_without_database(monkeypatch):
    # Не кидає: сервер має піднятись і віддати хоча б фронтенд.
    await _start(monkeypatch, DatabaseUnavailable("ConnectionRefusedError"))


async def test_startup_fails_on_broken_migration(monkeypatch):
    with pytest.raises(CommandError):
        await _start(monkeypatch, CommandError("Can't locate revision"))


async def test_column_comments_match_models(db):
    """Після міграцій коментарі колонок збігаються з app/models.py.

    Робоча база колись розійшлася зі свіжою (обернений знак у
    transactions.amount), і цього ніхто не помітив.
    """
    rows = (
        await db.execute(
            text(
                "SELECT c.relname, a.attname, col_description(c.oid, a.attnum) "
                "FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid "
                "WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' "
                "AND a.attnum > 0 AND NOT a.attisdropped AND c.relname <> 'alembic_version'"
            )
        )
    ).all()
    in_database = {(table, column): comment for table, column, comment in rows}
    in_models = {
        (table.name, column.name): column.comment
        for table in Base.metadata.tables.values()
        for column in table.columns
    }
    assert in_database == in_models
