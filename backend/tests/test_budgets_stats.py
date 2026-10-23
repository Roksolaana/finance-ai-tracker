"""Ліміти бюджету й стійкість статистики до несподіваних даних."""

import datetime
import uuid
from decimal import Decimal

import pytest

from app.models import Budget, Transaction

URL = "/api/v1/budgets/"


async def test_put_replaces_whole_set(client, alice):
    headers, _ = alice
    first = await client.put(
        URL,
        json=[{"category": "їжа", "monthly_limit": 6000}, {"category": "кафе", "monthly_limit": 1500}],
        headers=headers,
    )
    assert first.status_code == 200

    second = await client.put(URL, json=[{"category": "транспорт", "monthly_limit": 800}], headers=headers)
    assert second.status_code == 200

    # «їжа» й «кафе» не передані вдруге — отже, ліміти з них зняті.
    stored = (await client.get(URL, headers=headers)).json()
    assert stored == [{"category": "транспорт", "monthly_limit": 800}]


async def test_empty_put_clears_everything(client, alice):
    headers, _ = alice
    await client.put(URL, json=[{"category": "їжа", "monthly_limit": 6000}], headers=headers)
    assert (await client.put(URL, json=[], headers=headers)).json() == []


async def test_duplicate_category_is_rejected_without_changes(client, alice):
    headers, _ = alice
    await client.put(URL, json=[{"category": "кафе", "monthly_limit": 1500}], headers=headers)

    response = await client.put(
        URL,
        json=[{"category": "їжа", "monthly_limit": 6000}, {"category": "їжа", "monthly_limit": 100}],
        headers=headers,
    )
    assert response.status_code == 422
    assert "їжа" in response.json()["detail"]
    # Відхилений запит не мав стерти попередній набір.
    assert (await client.get(URL, headers=headers)).json() == [{"category": "кафе", "monthly_limit": 1500}]


async def test_budget_on_income_or_unknown_category_is_rejected(client, alice):
    headers, _ = alice
    for category in ("дохід", "щось нове"):
        response = await client.put(URL, json=[{"category": category, "monthly_limit": 100}], headers=headers)
        assert response.status_code == 422


async def test_budgets_are_per_account(client, alice, bob):
    alice_headers, _ = alice
    bob_headers, _ = bob
    await client.put(URL, json=[{"category": "їжа", "monthly_limit": 6000}], headers=alice_headers)
    await client.put(URL, json=[], headers=bob_headers)

    assert (await client.get(URL, headers=bob_headers)).json() == []
    assert len((await client.get(URL, headers=alice_headers)).json()) == 1


async def test_stats_survive_unknown_category(client, db, alice):
    """Запис зі старою чи сторонньою категорією не має валити дашборд."""
    headers, user_id = alice
    owner = uuid.UUID(user_id)
    when = datetime.datetime(2026, 10, 10, 12, tzinfo=datetime.timezone.utc)
    db.add_all(
        [
            Transaction(user_id=owner, amount=-50, category="щось нове", spent_at=when, note="Невідомо що"),
            Transaction(user_id=owner, amount=-150, category="їжа", spent_at=when),
            # Ліміт на категорію, якої вже немає в списку, — теж не має ламати.
            Budget(user_id=owner, category="щось нове", monthly_limit=100),
        ]
    )
    await db.commit()

    month = await client.get("/api/v1/stats/month", params={"month": "2026-10"}, headers=headers)
    assert month.status_code == 200
    body = month.json()
    assert body["total_expenses"] == 200
    assert {"category": "щось нове", "amount": 50, "percent": 25} in body["category_breakdown"]
    assert {"category": "щось нове", "limit": 100, "spent": 50} in body["budgets"]

    monthly = await client.get("/api/v1/stats/monthly", params={"until": "2026-10", "months": 3}, headers=headers)
    assert monthly.status_code == 200
    assert monthly.json()["categories"][-1]["amounts"]["щось нове"] == 50

    # Читання списку теж працює: категорія у відповіді — довільний рядок.
    listed = await client.get("/api/v1/transactions/", headers=headers)
    assert listed.status_code == 200
    assert {item["category"] for item in listed.json()["items"]} == {"щось нове", "їжа"}


@pytest.mark.parametrize(
    "limit",
    [
        pytest.param(0.001, id="нуль після округлення"),
        pytest.param(0, id="нуль"),
        pytest.param(-100, id="відʼємний"),
        pytest.param(1e20, id="не вміщається в numeric(12,2)"),
    ],
)
async def test_bad_limit_is_rejected_and_list_still_works(client, alice, limit):
    headers, _ = alice
    response = await client.put(URL, json=[{"category": "їжа", "monthly_limit": limit}], headers=headers)
    assert response.status_code == 422
    message = response.json()["detail"][0]["msg"]
    assert "Ліміт має бути більшим за нуль" in message or "Сума занадто велика" in message

    listed = await client.get(URL, headers=headers)
    assert listed.status_code == 200
    assert listed.json() == []


async def test_limit_is_rounded_to_cents(client, alice):
    headers, _ = alice
    response = await client.put(URL, json=[{"category": "їжа", "monthly_limit": 100.005}], headers=headers)
    assert response.status_code == 200
    assert (await client.get(URL, headers=headers)).json() == [{"category": "їжа", "monthly_limit": 100.01}]


async def test_stats_money_has_no_float_tails(client, db, alice):
    """0.3 - 0.2 у float — це 0.09999999999999998, а не 0.1."""
    headers, user_id = alice
    owner = uuid.UUID(user_id)
    when = datetime.datetime(2026, 9, 10, 12, tzinfo=datetime.timezone.utc)
    db.add_all(
        [
            Transaction(user_id=owner, amount=Decimal("0.3"), category="дохід", spent_at=when),
            Transaction(user_id=owner, amount=Decimal("-0.2"), category="їжа", spent_at=when),
        ]
    )
    await db.commit()

    month = (await client.get("/api/v1/stats/month", params={"month": "2026-09"}, headers=headers)).json()
    assert month["balance"] == 0.1
    assert month["total_balance"] == 0.1

    monthly = (await client.get("/api/v1/stats/monthly", params={"until": "2026-09", "months": 1}, headers=headers)).json()
    assert monthly["summaries"][0]["net"] == 0.1


@pytest.mark.parametrize("month", ["0000-01", "0001-01", "9999-12", "1999-12"])
async def test_stats_reject_years_out_of_range(client, alice, month):
    headers, _ = alice
    for path, key in (("/api/v1/stats/month", "month"), ("/api/v1/stats/monthly", "until")):
        response = await client.get(path, params={key: month}, headers=headers)
        assert response.status_code == 422, (path, month)
