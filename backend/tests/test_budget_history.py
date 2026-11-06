"""Історія лімітів: зміна ліміту діє з поточного місяця, а не заднім числом."""

import datetime
import uuid

from alembic import command
from conftest import run_sql
from sqlalchemy import select, text

from app.migrate import alembic_config
from app.models import BudgetHistory
from app.tools import check_budgets

D = datetime.date
URL = "/api/v1/budgets/"


def set_today(monkeypatch, day: datetime.date) -> None:
    monkeypatch.setattr("app.routers.budgets.local_today", lambda: day)


async def put(client, headers, limits: dict[str, float]) -> None:
    response = await client.put(
        URL, json=[{"category": c, "monthly_limit": v} for c, v in limits.items()], headers=headers
    )
    assert response.status_code == 200, response.text


async def limits_in(db, owner, month: str) -> dict[str, float]:
    outcome = await check_budgets(db, owner, month)
    return {row["category"]: row["limit"] for row in outcome.payload["budgets"]}


async def test_limit_change_does_not_rewrite_past_months(client, db, alice, monkeypatch):
    headers, user_id = alice
    owner = uuid.UUID(user_id)

    set_today(monkeypatch, D(2026, 9, 15))
    await put(client, headers, {"кафе": 1000})
    set_today(monkeypatch, D(2026, 10, 3))
    await put(client, headers, {"кафе": 1500})

    assert await limits_in(db, owner, "2026-09") == {"кафе": 1000}
    assert await limits_in(db, owner, "2026-10") == {"кафе": 1500}
    # Ліміт діє й далі, поки його не змінять.
    assert await limits_in(db, owner, "2026-12") == {"кафе": 1500}
    # До першого встановлення ліміту не було.
    assert await limits_in(db, owner, "2026-08") == {}

    for month, limit in (("2026-09", 1000), ("2026-10", 1500)):
        stats = (await client.get("/api/v1/stats/month", params={"month": month}, headers=headers)).json()
        assert stats["budgets"] == [{"category": "кафе", "limit": limit, "spent": 0}]

    # Для інтерфейсу нічого не змінилось: список — це поточні ліміти.
    assert (await client.get(URL, headers=headers)).json() == [{"category": "кафе", "monthly_limit": 1500}]


async def test_second_change_in_same_month_updates_that_version(client, db, alice, monkeypatch):
    headers, user_id = alice
    owner = uuid.UUID(user_id)

    set_today(monkeypatch, D(2026, 9, 15))
    await put(client, headers, {"кафе": 1000})
    set_today(monkeypatch, D(2026, 10, 3))
    await put(client, headers, {"кафе": 1200})
    set_today(monkeypatch, D(2026, 10, 20))
    await put(client, headers, {"кафе": 1300})

    rows = (
        await db.execute(
            select(BudgetHistory.valid_from, BudgetHistory.monthly_limit)
            .where(BudgetHistory.user_id == owner)
            .order_by(BudgetHistory.valid_from)
        )
    ).all()
    assert [(day, float(limit)) for day, limit in rows] == [(D(2026, 9, 1), 1000), (D(2026, 10, 1), 1300)]
    assert await limits_in(db, owner, "2026-09") == {"кафе": 1000}


async def test_unchanged_limits_add_no_versions(client, db, alice, monkeypatch):
    """Діалог надсилає весь набір щоразу — незмінені ліміти не мають плодити версії."""
    headers, user_id = alice
    owner = uuid.UUID(user_id)

    set_today(monkeypatch, D(2026, 9, 15))
    await put(client, headers, {"кафе": 1000, "їжа": 5000})
    set_today(monkeypatch, D(2026, 10, 3))
    await put(client, headers, {"кафе": 1000, "їжа": 6000})

    rows = (
        await db.execute(
            select(BudgetHistory.category, BudgetHistory.valid_from).where(BudgetHistory.user_id == owner)
        )
    ).all()
    assert sorted(rows) == [("кафе", D(2026, 9, 1)), ("їжа", D(2026, 9, 1)), ("їжа", D(2026, 10, 1))]


async def test_removed_limit_stays_in_past_months(client, db, alice, monkeypatch):
    headers, user_id = alice
    owner = uuid.UUID(user_id)

    set_today(monkeypatch, D(2026, 9, 15))
    await put(client, headers, {"кафе": 1000, "їжа": 5000})
    # Категорії немає в новому наборі — з жовтня ліміт знято.
    set_today(monkeypatch, D(2026, 10, 3))
    await put(client, headers, {"їжа": 5000})
    set_today(monkeypatch, D(2026, 11, 2))
    assert (await client.delete(f"{URL}їжа", headers=headers)).status_code == 204

    assert await limits_in(db, owner, "2026-09") == {"кафе": 1000, "їжа": 5000}
    assert await limits_in(db, owner, "2026-10") == {"їжа": 5000}
    assert await limits_in(db, owner, "2026-11") == {}
    assert (await client.get(URL, headers=headers)).json() == []


def test_migration_moves_existing_limits_into_history(test_database):
    """Наявні ліміти переносяться з valid_from = місяць останньої зміни."""
    config = alembic_config()
    command.downgrade(config, "0005")
    try:
        user_id = uuid.uuid4()
        run_sql(
            f"INSERT INTO users (id, email, password_hash, display_name) "
            f"VALUES ('{user_id}', 'migrate@example.com', 'x', 'm')",
            # 21 вересня за Києвом.
            f"INSERT INTO budgets (user_id, category, monthly_limit, updated_at) "
            f"VALUES ('{user_id}', 'кафе', 1000, '2026-09-20 22:30+00')",
            # 30 вересня 22:30 UTC — це вже 1 жовтня за Києвом.
            f"INSERT INTO budgets (user_id, category, monthly_limit, updated_at) "
            f"VALUES ('{user_id}', 'їжа', 5000, '2026-09-30 22:30+00')",
        )
        command.upgrade(config, "0006")
        rows = run_sql(f"SELECT category, monthly_limit, valid_from FROM budget_history WHERE user_id = '{user_id}'")
        assert sorted((r["category"], float(r["monthly_limit"]), r["valid_from"]) for r in rows) == [
            ("кафе", 1000, D(2026, 9, 1)),
            ("їжа", 5000, D(2026, 10, 1)),
        ]
    finally:
        command.upgrade(config, "head")
        run_sql("DELETE FROM users WHERE email = 'migrate@example.com'")


async def test_history_is_the_only_source_of_limits(client, db, alice):
    """Поточний ліміт — останній запис історії; окремої таблиці budgets немає."""
    headers, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all(
        [
            BudgetHistory(user_id=owner, category="кафе", valid_from=D(2026, 9, 1), monthly_limit=700),
            BudgetHistory(user_id=owner, category="кафе", valid_from=D(2026, 10, 1), monthly_limit=900),
            # Знятий ліміт у переліку поточних не показується.
            BudgetHistory(user_id=owner, category="їжа", valid_from=D(2026, 9, 1), monthly_limit=5000),
            BudgetHistory(user_id=owner, category="їжа", valid_from=D(2026, 10, 1), monthly_limit=None),
        ]
    )
    await db.commit()

    assert (await client.get(URL, headers=headers)).json() == [{"category": "кафе", "monthly_limit": 900}]
    assert (await db.execute(text("SELECT to_regclass('public.budgets')"))).scalar_one() is None


def test_migration_moves_limits_without_history_before_dropping_budgets(test_database):
    """Рядок budgets без жодної версії в історії не губиться при видаленні таблиці."""
    config = alembic_config()
    command.downgrade(config, "0008")
    try:
        user_id = uuid.uuid4()
        run_sql(
            f"INSERT INTO users (id, email, password_hash, display_name) "
            f"VALUES ('{user_id}', 'migrate@example.com', 'x', 'm')",
            f"INSERT INTO budgets (user_id, category, monthly_limit, updated_at) "
            f"VALUES ('{user_id}', 'кафе', 1000, '2026-09-20 12:00+00')",
            # Цей уже має історію — його версії міграція не чіпає.
            f"INSERT INTO budgets (user_id, category, monthly_limit, updated_at) "
            f"VALUES ('{user_id}', 'їжа', 6000, '2026-10-05 12:00+00')",
            f"INSERT INTO budget_history (user_id, category, valid_from, monthly_limit) "
            f"VALUES ('{user_id}', 'їжа', '2026-08-01', 5000), ('{user_id}', 'їжа', '2026-10-01', 6000)",
        )
        command.upgrade(config, "0009")
        rows = run_sql(
            f"SELECT category, valid_from, monthly_limit FROM budget_history "
            f"WHERE user_id = '{user_id}'"
        )
        assert {(r["category"], r["valid_from"], float(r["monthly_limit"])) for r in rows} == {
            ("кафе", D(2026, 9, 1), 1000),
            ("їжа", D(2026, 8, 1), 5000),
            ("їжа", D(2026, 10, 1), 6000),
        }
        assert run_sql("SELECT to_regclass('public.budgets') AS t")[0]["t"] is None
    finally:
        command.upgrade(config, "head")
        run_sql("DELETE FROM users WHERE email = 'migrate@example.com'")
