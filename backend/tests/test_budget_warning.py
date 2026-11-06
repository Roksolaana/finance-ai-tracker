"""Попередження про ліміт у відповіді на створення витрати."""

import datetime

import pytest

from app.timeutils import TZ, frozen_today

URL = "/api/v1/transactions/"


@pytest.fixture(autouse=True)
def september_first():
    # Ліміт, заданий через API, діє з поточного місяця — хай це буде
    # вересень, щоб він покривав і вересневі, і жовтневі витрати тестів.
    with frozen_today(datetime.date(2026, 9, 1)):
        yield


def at(day: int, month: int = 10) -> str:
    return datetime.datetime(2026, month, day, 12, tzinfo=TZ).isoformat()


async def setup_limit(client, headers, category="кафе", limit=1000):
    response = await client.put("/api/v1/budgets/", json=[{"category": category, "monthly_limit": limit}], headers=headers)
    assert response.status_code == 200


async def test_no_warning_below_80_percent(client, alice):
    headers, _ = alice
    await setup_limit(client, headers)
    response = await client.post(URL, json={"amount": -700, "category": "кафе", "spent_at": at(5)}, headers=headers)
    assert response.status_code == 201
    assert response.json()["budget_warning"] is None


async def test_warning_from_80_percent_and_over_limit(client, alice):
    headers, _ = alice
    await setup_limit(client, headers)
    await client.post(URL, json={"amount": -700, "category": "кафе", "spent_at": at(5)}, headers=headers)

    near = (await client.post(URL, json={"amount": -150, "category": "кафе", "spent_at": at(6)}, headers=headers)).json()
    assert near["budget_warning"] == {
        "category": "кафе",
        "month": "2026-10",
        "limit": 1000.0,
        "spent": 850.0,
        "used_percent": 85,
        "over_by": 0.0,
        "message": "Витрачено 85% ліміту на «кафе» за жовтень: 850 ₴ з 1 000 ₴",
    }

    over = (await client.post(URL, json={"amount": -430, "category": "кафе", "spent_at": at(7)}, headers=headers)).json()
    assert over["budget_warning"]["over_by"] == 280.0
    assert over["budget_warning"]["message"] == "Ліміт на «кафе» за жовтень перевищено на 280 ₴: 1 280 ₴ з 1 000 ₴"


async def test_warning_counts_the_month_of_the_transaction(client, alice):
    """Запис заднім числом звіряється з лімітом і витратами свого місяця."""
    headers, _ = alice
    await setup_limit(client, headers)
    await client.post(URL, json={"amount": -900, "category": "кафе", "spent_at": at(5)}, headers=headers)
    september = (
        await client.post(URL, json={"amount": -100, "category": "кафе", "spent_at": at(20, 9)}, headers=headers)
    ).json()
    # У вересні витрачено лише 100 ₴ — жовтневі 900 ₴ сюди не входять.
    assert september["budget_warning"] is None


async def test_no_warning_without_limit_or_for_income(client, alice):
    headers, _ = alice
    await setup_limit(client, headers, category="кафе", limit=100)
    other = await client.post(URL, json={"amount": -5000, "category": "їжа", "spent_at": at(5)}, headers=headers)
    assert other.json()["budget_warning"] is None
    income = await client.post(URL, json={"amount": 2000, "category": "дохід", "spent_at": at(5)}, headers=headers)
    assert income.json()["budget_warning"] is None
