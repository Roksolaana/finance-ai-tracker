"""Гібридний інструмент і поведінка старту при проблемах з базою."""

import datetime
import uuid

import pytest
from alembic.util import CommandError

from app import main
from app.database import settings
from app.migrate import DatabaseUnavailable, upgrade_to_head
from app.models import Transaction
from app.search import SearchHit
from app.tools import hybrid_search_and_sum

OCTOBER = datetime.datetime(2026, 10, 10, 12, tzinfo=datetime.timezone.utc)


async def test_hybrid_counts_only_expenses(db, monkeypatch, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    stress = Transaction(user_id=owner, amount=-390, category="покупки", spent_at=OCTOBER, note="Косметика, щоб зняти стрес")
    grant = Transaction(user_id=owner, amount=2918, category="дохід", spent_at=OCTOBER, note="Стипендія за місяць")
    db.add_all([stress, grant])
    await db.commit()

    # Векторний пошук підмінено: саме такий збіг він давав на реальних даних.
    async def fake_search(db, user_id, query_text, top_k=50, threshold=None, expenses_only=False):
        return [SearchHit(stress, 0.6), SearchHit(grant, 0.5)]

    monkeypatch.setattr("app.tools.semantic_search", fake_search)

    outcome = await hybrid_search_and_sum(db, owner, "витрати через стрес цього місяця", "2026-10-01", "2026-10-31")

    assert outcome.payload["total"] == 390
    assert outcome.payload["count"] == 1
    assert outcome.payload["matched_notes"] == ["Косметика, щоб зняти стрес"]
    assert [t.id for t in outcome.transactions] == [stress.id]


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
