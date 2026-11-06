"""Теги настрою: збереження, перевірка, пошук за тегом без нотатки."""

import datetime
import math
import uuid

import pytest

from app.models import Transaction
from app.search import semantic_search
from app.tools import hybrid_search_and_sum

URL = "/api/v1/transactions/"
WHEN = datetime.datetime(2026, 9, 10, 12, tzinfo=datetime.timezone.utc)


def vector(similarity: float) -> list[float]:
    return [similarity, math.sqrt(1 - similarity**2)] + [0.0] * 382


@pytest.fixture
def fake_embedding(monkeypatch):
    monkeypatch.setattr("app.search.embed_one", lambda text: vector(1.0))


async def test_tags_are_saved_and_returned(client, alice):
    headers, _ = alice
    created = await client.post(
        URL, json={"amount": -85, "category": "кафе", "tags": ["стрес", "втома", "стрес"]}, headers=headers
    )
    assert created.status_code == 201, created.text
    # Повтор прибрано, порядок вибору збережено.
    assert created.json()["tags"] == ["стрес", "втома"]

    updated = await client.put(
        f"{URL}{created.json()['id']}", json={"amount": -85, "category": "кафе", "tags": ["з друзями"]}, headers=headers
    )
    assert updated.json()["tags"] == ["з друзями"]

    # Без тегів — порожній список, а не null: клієнту не треба перевіряти обидва.
    plain = await client.post(URL, json={"amount": -10, "category": "їжа"}, headers=headers)
    assert plain.json()["tags"] == []


async def test_unknown_tag_is_rejected(client, alice):
    headers, _ = alice
    response = await client.post(URL, json={"amount": -85, "category": "кафе", "tags": ["сум"]}, headers=headers)
    assert response.status_code == 422
    assert "сум" in response.text


async def test_tag_finds_record_without_note(db, alice, fake_embedding):
    """Запис без нотатки не має вектора, але тег «стрес» — явна позначка користувача."""
    _, user_id = alice
    owner = uuid.UUID(user_id)
    tagged = Transaction(user_id=owner, amount=-300, category="покупки", spent_at=WHEN, tags=["стрес"])
    # Схожість нижче порога й тегу немає — не має потрапити.
    other = Transaction(
        user_id=owner, amount=-50, category="їжа", spent_at=WHEN, note="Хліб", embedding=vector(0.2), tags=["необхідне"]
    )
    db.add_all([tagged, other])
    await db.commit()

    hits = await semantic_search(db, owner, "витрати через стрес")
    assert [h.transaction.id for h in hits] == [tagged.id]

    outcome = await hybrid_search_and_sum(db, owner, "скільки я витратила через стрес")
    assert outcome.payload["total"] == 300
    assert outcome.payload["count"] == 1

    # Тег, не названий у запиті, нічого не додає.
    assert await semantic_search(db, owner, "витрати на подарунки") == []


async def test_tag_forms_in_query(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all(
        [
            Transaction(user_id=owner, amount=-120, category="кафе", spent_at=WHEN, tags=["втома"]),
            Transaction(user_id=owner, amount=-400, category="розваги", spent_at=WHEN, tags=["з друзями"]),
            Transaction(user_id=owner, amount=-900, category="покупки", spent_at=WHEN, tags=["імпульс"]),
        ]
    )
    await db.commit()

    def amounts(hits):
        return sorted(float(h.transaction.amount) for h in hits)

    assert amounts(await semantic_search(db, owner, "коли я була втомлена")) == [-120]
    assert amounts(await semantic_search(db, owner, "розваги з друзями")) == [-400]
    assert amounts(await semantic_search(db, owner, "імпульсивні покупки")) == [-900]
