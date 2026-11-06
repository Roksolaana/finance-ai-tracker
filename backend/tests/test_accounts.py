"""Акаунти: власник кожної транзакції, захист входу, керування акаунтом."""

import datetime
import uuid

import jwt
import pytest
from alembic import command
from conftest import register, run_sql
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text

from app.database import settings
from app.main import app
from app.migrate import alembic_config
from app.models import BudgetHistory, ChatMessage, Transaction
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


# --- керування акаунтом ---

ME = "/api/v1/auth/me"


async def change_password(client, headers, current="password123", new="new-password-456"):
    return await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": current, "new_password": new},
        headers=headers,
    )


async def test_change_password_revokes_old_tokens(client, alice):
    headers, _ = alice
    # Другий пристрій з окремим токеном.
    other_device = {"Authorization": f"Bearer {(await login(client, password='password123')).json()['access_token']}"}

    response = await change_password(client, headers)
    assert response.status_code == 200
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}

    # Пристрій, з якого змінили пароль, лишається в акаунті з новим токеном.
    assert (await client.get(ME, headers=fresh)).status_code == 200
    assert (await client.get(ME, headers=headers)).status_code == 401
    assert (await client.get(ME, headers=other_device)).status_code == 401

    assert (await login(client, password="password123")).status_code == 401
    assert (await login(client, password="new-password-456")).status_code == 200


async def test_change_password_needs_current_one(client, alice):
    headers, _ = alice
    response = await change_password(client, headers, current="not-my-password")
    # 400, а не 401: на 401 клієнт вважає токен недійсним і виходить з акаунта.
    assert response.status_code == 400
    assert "поточний пароль" in response.json()["detail"]
    assert (await client.get(ME, headers=headers)).status_code == 200
    assert (await login(client, password="password123")).status_code == 200


async def test_new_password_is_validated(client, alice):
    headers, _ = alice
    assert (await change_password(client, headers, new="short")).status_code == 422


async def test_logout_all_revokes_every_token(client, alice):
    headers, _ = alice
    other_device = {"Authorization": f"Bearer {(await login(client, password='password123')).json()['access_token']}"}

    assert (await client.post("/api/v1/auth/logout-all", headers=headers)).status_code == 204

    assert (await client.get(ME, headers=headers)).status_code == 401
    assert (await client.get(ME, headers=other_device)).status_code == 401
    # Пароль той самий — увійти знову можна.
    relogin = await login(client, password="password123")
    assert relogin.status_code == 200
    assert (await client.get(ME, headers={"Authorization": f"Bearer {relogin.json()['access_token']}"})).status_code == 200


async def test_token_without_version_works_until_revoked(client, alice):
    """Токени, видані до появи `ver`, діють, доки акаунт не відкличе всі сесії."""
    headers, user_id = alice
    legacy = jwt.encode(
        {
            "sub": user_id,
            "iat": datetime.datetime.now(datetime.timezone.utc),
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    legacy_headers = {"Authorization": f"Bearer {legacy}"}
    assert (await client.get(ME, headers=legacy_headers)).status_code == 200

    await client.post("/api/v1/auth/logout-all", headers=headers)
    assert (await client.get(ME, headers=legacy_headers)).status_code == 401


async def test_delete_account_removes_all_data(client, db, alice, bob):
    headers, user_id = alice
    bob_headers, bob_id = bob
    owner = uuid.UUID(user_id)
    for who in (owner, uuid.UUID(bob_id)):
        db.add_all(
            [
                Transaction(user_id=who, amount=-100, category="їжа", note="Обід"),
                BudgetHistory(user_id=who, category="їжа", valid_from=datetime.date(2026, 10, 1), monthly_limit=1000),
                ChatMessage(user_id=who, role="user", content="Привіт"),
            ]
        )
    await db.commit()
    await client.put("/api/v1/budgets/", json=[{"category": "кафе", "monthly_limit": 500}], headers=headers)

    wrong = await client.request("DELETE", ME, json={"password": "not-my-password"}, headers=headers)
    assert wrong.status_code == 400
    assert (await client.get(ME, headers=headers)).status_code == 200

    response = await client.request("DELETE", ME, json={"password": "password123"}, headers=headers)
    assert response.status_code == 204

    assert (await client.get(ME, headers=headers)).status_code == 401
    assert (await login(client, password="password123")).status_code == 401
    for model in (Transaction, BudgetHistory, ChatMessage):
        left = (await db.execute(select(func.count()).select_from(model).where(model.user_id == owner))).scalar_one()
        assert left == 0, model.__tablename__
    # Чужі дані на місці.
    assert (await client.get("/api/v1/transactions/", headers=bob_headers)).json()["total"] == 1


async def test_delete_account_removes_chat_and_limit_history(client, db, alice, bob):
    """Розмова й історія лімітів — теж дані акаунта; чужі лишаються."""
    headers, user_id = alice
    bob_headers, bob_id = bob
    for who, who_headers in ((user_id, headers), (bob_id, bob_headers)):
        db.add(ChatMessage(user_id=uuid.UUID(who), role="user", content="Скільки на каву?"))
        await client.put("/api/v1/budgets/", json=[{"category": "кафе", "monthly_limit": 500}], headers=who_headers)
    await db.commit()

    response = await client.request("DELETE", ME, json={"password": "password123"}, headers=headers)
    assert response.status_code == 204

    async def count(model, owner):
        query = select(func.count()).select_from(model).where(model.user_id == uuid.UUID(owner))
        return (await db.execute(query)).scalar_one()

    assert await count(ChatMessage, user_id) == 0
    assert await count(BudgetHistory, user_id) == 0
    assert await count(ChatMessage, bob_id) == 1
    assert await count(BudgetHistory, bob_id) == 1


async def test_token_issued_before_logout_all_gets_401(client, alice):
    headers, _ = alice
    before = (await login(client, password="password123")).json()["access_token"]
    assert (await client.get(ME, headers={"Authorization": f"Bearer {before}"})).status_code == 200

    assert (await client.post("/api/v1/auth/logout-all", headers=headers)).status_code == 204

    revoked = await client.get(ME, headers={"Authorization": f"Bearer {before}"})
    assert revoked.status_code == 401
    # Новий вхід після відкликання дає робочий токен.
    after = (await login(client, password="password123")).json()["access_token"]
    assert (await client.get(ME, headers={"Authorization": f"Bearer {after}"})).status_code == 200
