"""Транзакції: валідація вводу, межі місяця за місцевим часом, ізоляція акаунтів."""

import datetime

import pytest

from app.timeutils import TZ, local_midnight

URL = "/api/v1/transactions/"


async def add(client, headers, **fields):
    body = {"amount": -100, "category": "їжа", **fields}
    return await client.post(URL, json=body, headers=headers)


# --- місцевий час ---


def test_utc_late_evening_is_next_local_day():
    # 31 березня 22:30 UTC — це вже 1 квітня 01:30 у Києві (літній час з 29.03).
    moment = datetime.datetime(2026, 3, 31, 22, 30, tzinfo=datetime.timezone.utc)
    assert moment.astimezone(TZ).date() == datetime.date(2026, 4, 1)
    assert local_midnight(datetime.date(2026, 4, 1)) == datetime.datetime(
        2026, 3, 31, 21, 0, tzinfo=datetime.timezone.utc
    )


async def test_month_stats_use_local_month(client, alice):
    headers, _ = alice
    response = await add(client, headers, spent_at="2026-03-31T22:30:00Z")
    assert response.status_code == 201

    april = (await client.get("/api/v1/stats/month", params={"month": "2026-04"}, headers=headers)).json()
    march = (await client.get("/api/v1/stats/month", params={"month": "2026-03"}, headers=headers)).json()

    assert april["transaction_count"] == 1
    assert april["total_expenses"] == 100
    assert april["cashflow"][0] == {"date": "2026-04-01", "income": 0, "expense": 100}
    assert march["transaction_count"] == 0


async def test_list_filters_by_local_day(client, alice):
    headers, _ = alice
    await add(client, headers, spent_at="2026-03-31T22:30:00Z")

    first_april = await client.get(URL, params={"date_from": "2026-04-01", "date_to": "2026-04-01"}, headers=headers)
    last_march = await client.get(URL, params={"date_from": "2026-03-31", "date_to": "2026-03-31"}, headers=headers)

    assert first_april.json()["total"] == 1
    assert last_march.json()["total"] == 0


# --- валідація ---


@pytest.mark.parametrize(
    "fields",
    [
        pytest.param({"amount": 0}, id="нульова сума"),
        pytest.param({"spent_at": "2099-01-01T00:00:00Z"}, id="дата в майбутньому"),
        pytest.param({"category": "кава"}, id="невідома категорія"),
        pytest.param({"amount": 500, "category": "їжа"}, id="дохід у витратній категорії"),
        pytest.param({"amount": -500, "category": "дохід"}, id="витрата в категорії дохід"),
        # Після округлення до копійки це нуль — ні дохід, ні витрата.
        pytest.param({"amount": 0.004, "category": "дохід"}, id="нуль після округлення"),
        pytest.param({"amount": -0.004}, id="відʼємний нуль після округлення"),
        pytest.param({"amount": -1e20}, id="не вміщається в numeric(12,2)"),
        pytest.param({"amount": -9999999999.995}, id="виходить за межу після округлення"),
        pytest.param({"spent_at": "0001-01-01T00:00:00Z"}, id="рік 0001"),
        pytest.param({"spent_at": "1999-12-31T12:00:00Z"}, id="раніше 2000 року"),
    ],
)
async def test_invalid_transaction_is_rejected(client, alice, fields):
    headers, _ = alice
    response = await add(client, headers, **fields)
    assert response.status_code == 422
    assert (await client.get(URL, headers=headers)).json()["total"] == 0


async def test_valid_income_and_expense_are_accepted(client, alice):
    headers, _ = alice
    assert (await add(client, headers, amount=2500, category="дохід")).status_code == 201
    expense = await add(client, headers, amount=-149.999, category="кафе", note="  Лате  ")
    assert expense.status_code == 201
    # Сума округлюється до копійки, порожні краї нотатки обрізаються.
    assert expense.json()["amount"] == -150.0
    assert expense.json()["note"] == "Лате"


async def test_update_is_validated_too(client, alice):
    headers, _ = alice
    created = (await add(client, headers)).json()
    response = await client.put(f"{URL}{created['id']}", json={"amount": 300, "category": "їжа"}, headers=headers)
    assert response.status_code == 422


# --- ізоляція акаунтів ---


async def test_foreign_transaction_is_invisible(client, alice, bob):
    alice_headers, _ = alice
    bob_headers, _ = bob
    tx = (await add(client, alice_headers, note="Обід")).json()
    path = f"{URL}{tx['id']}"

    assert (await client.get(path, headers=bob_headers)).status_code == 404
    update = await client.put(path, json={"amount": -1, "category": "інше"}, headers=bob_headers)
    assert update.status_code == 404
    assert (await client.delete(path, headers=bob_headers)).status_code == 404

    # Запис Аліси лишився недоторканим.
    own = await client.get(path, headers=alice_headers)
    assert own.status_code == 200
    assert own.json()["amount"] == -100


async def test_lists_and_stats_do_not_leak(client, alice, bob):
    alice_headers, _ = alice
    bob_headers, _ = bob
    await add(client, alice_headers, spent_at="2026-10-05T12:00:00Z")

    bob_list = (await client.get(URL, headers=bob_headers)).json()
    bob_stats = (await client.get("/api/v1/stats/month", params={"month": "2026-10"}, headers=bob_headers)).json()

    assert bob_list == {"items": [], "total": 0, "page": 1, "per_page": 20}
    assert bob_stats["transaction_count"] == 0
    assert bob_stats["total_balance"] == 0


async def test_requests_without_token_are_rejected(client):
    assert (await client.get(URL)).status_code == 401


async def test_largest_amount_still_fits(client, alice):
    headers, _ = alice
    response = await add(client, headers, amount=9999999999.99, category="дохід")
    assert response.status_code == 201


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"date_from": "0001-01-01"}, id="date_from 0001"),
        pytest.param({"date_to": "9999-12-31"}, id="date_to 9999"),
        pytest.param({"date_from": "1999-12-31", "date_to": "2000-01-31"}, id="date_from 1999"),
    ],
)
async def test_list_rejects_dates_out_of_range(client, alice, params):
    headers, _ = alice
    response = await client.get(URL, params=params, headers=headers)
    assert response.status_code == 422
    assert "2000" in response.json()["detail"]
