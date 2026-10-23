"""Ліміти бюджету й стійкість статистики до несподіваних даних."""

import datetime
import uuid

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
