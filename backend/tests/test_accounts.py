"""Акаунти: власник кожної транзакції, захист входу, керування акаунтом."""

import pytest
from alembic import command
from conftest import register, run_sql
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.main import app
from app.migrate import alembic_config
from app.ratelimit import RateLimiter

# --- власник транзакції ---


def test_migration_stops_on_ownerless_transactions(test_database):
    """Записи без власника не видаляються мовчки — міграція зупиняється й пояснює чому."""
    config = alembic_config()
    command.downgrade(config, "0006")
    try:
        run_sql("INSERT INTO transactions (amount, category, note) VALUES (-100, 'їжа', 'без власника')")
        with pytest.raises(RuntimeError, match="без власника"):
            command.upgrade(config, "0007")
        # Схема лишилась на 0006, і запис на місці.
        assert run_sql("SELECT count(*) AS n FROM transactions WHERE user_id IS NULL")[0]["n"] == 1
        assert run_sql("SELECT version_num FROM alembic_version")[0]["version_num"] == "0006"
    finally:
        run_sql("DELETE FROM transactions WHERE user_id IS NULL")
        command.upgrade(config, "head")


async def test_transaction_owner_is_required(db):
    nullable = (
        await db.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name = 'transactions' AND column_name = 'user_id'"
            )
        )
    ).scalar_one()
    assert nullable == "NO"


async def test_first_account_starts_empty(client):
    """Перший акаунт більше не отримує жодних чужих чи «нічиїх» записів."""
    headers, _ = await register(client, "first@example.com")
    listed = await client.get("/api/v1/transactions/", headers=headers)
    assert listed.json()["total"] == 0


# --- захист входу від підбору пароля ---

LOGIN = "/api/v1/auth/login"


async def login(client, email="alice@example.com", password="wrong-password"):
    return await client.post(LOGIN, json={"email": email, "password": password})


def test_limiter_window_slides():
    now = [1000.0]
    limiter = RateLimiter(window=900, clock=lambda: now[0])
    for _ in range(5):
        assert limiter.retry_after("k", limit=5) is None
        limiter.record("k")
    assert limiter.retry_after("k", limit=5) == 900

    now[0] += 600
    assert limiter.retry_after("k", limit=5) == 300
    # Найстаріша спроба вийшла з вікна — можна знову.
    now[0] += 300
    assert limiter.retry_after("k", limit=5) is None


async def test_login_is_blocked_after_five_failures(client, alice):
    for _ in range(5):
        assert (await login(client)).status_code == 401

    # Навіть правильний пароль не перевіряється, поки діє блокування.
    blocked = await login(client, password="password123")
    assert blocked.status_code == 429
    assert "спроб входу" in blocked.json()["detail"]
    assert 0 < int(blocked.headers["Retry-After"]) <= 15 * 60


async def test_login_limit_is_per_email_and_address(client, alice, bob):
    for _ in range(5):
        await login(client)

    # Інший акаунт з тієї самої адреси входить як звичайно.
    assert (await login(client, "bob@example.com", "password123")).status_code == 200

    # Той самий акаунт з іншої адреси теж: підбирає пароль хтось один.
    transport = ASGITransport(app=app, client=("10.0.0.2", 5000))
    async with AsyncClient(transport=transport, base_url="http://test") as other:
        assert (await login(other, password="password123")).status_code == 200


async def test_successful_login_resets_failures(client, alice):
    for _ in range(4):
        await login(client)
    assert (await login(client, password="password123")).status_code == 200
    # Лічильник почався заново — ще чотири помилки не блокують.
    for _ in range(4):
        assert (await login(client)).status_code == 401
