"""Регулярні платежі: серії з близькою сумою, однаковою нотаткою й інтервалом ~місяць."""

import datetime
import uuid

from app.models import Transaction
from app.recurring import find_series
from app.tools import HANDLERS, tool_schemas
from app.timeutils import TZ

D = datetime.date
URL = "/api/v1/stats/recurring"


def at(day: datetime.date) -> datetime.datetime:
    return datetime.datetime.combine(day, datetime.time(12), tzinfo=TZ)


def tx(owner, day, amount, category="підписки", note=None):
    return Transaction(user_id=owner, amount=amount, category=category, spent_at=at(day), note=note)


async def test_monthly_series_is_found_with_next_date(db, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all(
        [
            tx(owner, D(2026, 7, 7), -130, note="Netflix"),
            tx(owner, D(2026, 8, 7), -130, note="netflix "),
            tx(owner, D(2026, 9, 6), -135, note="Netflix"),
            # Ще одна серія — без нотатки, за категорією.
            tx(owner, D(2026, 7, 3), -900, "комунальні"),
            tx(owner, D(2026, 8, 3), -900, "комунальні"),
            tx(owner, D(2026, 9, 3), -900, "комунальні"),
            tx(owner, D(2026, 10, 3), -900, "комунальні"),
        ]
    )
    await db.commit()

    series = await find_series(db, owner)

    by_name = {s.name: s for s in series}
    assert set(by_name) == {"Netflix", "комунальні"}
    netflix = by_name["Netflix"]
    assert (netflix.count, netflix.category, netflix.average_amount) == (3, "підписки", 131.67)
    assert netflix.last_date == D(2026, 9, 6)
    assert netflix.interval_days == 30
    assert netflix.next_date == D(2026, 10, 6)
    assert by_name["комунальні"].next_date == D(2026, 11, 3)
    # Найближче списання — першим.
    assert [s.name for s in series] == ["Netflix", "комунальні"]


async def test_not_recurring(db, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all(
        [
            # Щодня — не щомісяця.
            *(tx(owner, D(2026, 9, d), -85, "кафе", "Кава з автомата") for d in range(1, 8)),
            # Сума стрибає більше ніж на 10% — це не та сама підписка.
            tx(owner, D(2026, 7, 5), -100, note="Spotify"),
            tx(owner, D(2026, 8, 5), -100, note="Spotify"),
            tx(owner, D(2026, 9, 5), -200, note="Spotify"),
            # Лише два повтори.
            tx(owner, D(2026, 8, 9), -149, note="Duolingo"),
            tx(owner, D(2026, 9, 9), -149, note="Duolingo"),
            # Дохід — не платіж.
            *(tx(owner, D(2026, m, 10), 2000, "дохід", "Стипендія") for m in (7, 8, 9)),
        ]
    )
    await db.commit()

    assert await find_series(db, owner) == []


async def test_recurring_endpoint_is_per_account(client, db, alice, bob):
    headers, user_id = alice
    bob_headers, _ = bob
    owner = uuid.UUID(user_id)
    db.add_all([tx(owner, D(2026, m, 12), -75, note="Google One 100 ГБ") for m in (7, 8, 9, 10)])
    await db.commit()

    body = (await client.get(URL, headers=headers)).json()
    assert body["items"] == [
        {
            "name": "Google One 100 ГБ",
            "category": "підписки",
            "average_amount": 75.0,
            "count": 4,
            "interval_days": 31,
            "last_date": "2026-10-12",
            "next_date": "2026-11-12",
        }
    ]
    assert (await client.get(URL, headers=bob_headers)).json()["items"] == []


async def test_find_recurring_tool(db, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all([tx(owner, D(2026, m, 5), -99, note="YouTube Premium") for m in (7, 8, 9)])
    await db.commit()

    assert "find_recurring" in {s["function"]["name"] for s in tool_schemas()}
    outcome = await HANDLERS["find_recurring"](db, owner)
    assert outcome.kind == "sql"
    item = outcome.payload["recurring"][0]
    assert (item["name"], item["average_amount"], item["next_date"]) == ("YouTube Premium", 99.0, "2026-10-05")
    # Сума всіх регулярних за місяць — теж від коду, а не від моделі.
    assert outcome.payload["monthly_total"] == 99.0
