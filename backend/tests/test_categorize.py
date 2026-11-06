"""Підказка категорії за схожими власними записами (kNN по ембедингах)."""

import datetime
import math
import uuid

from app.categorize import suggest_category, vote
from app.models import Transaction

WHEN = datetime.datetime(2026, 9, 10, 12, tzinfo=datetime.timezone.utc)
URL = "/api/v1/transactions/suggest-category"


def vector(similarity: float) -> list[float]:
    return [similarity, math.sqrt(1 - similarity**2)] + [0.0] * 382


QUERY = vector(1.0)


def test_vote_takes_majority_and_breaks_ties_by_similarity():
    assert vote([("кафе", 0.9), ("кафе", 0.8), ("їжа", 0.95), ("кафе", 0.7), ("їжа", 0.6)]) == ("кафе", 0.6)
    # Нічия 2:2 — перемагає категорія з ближчими сусідами.
    assert vote([("кафе", 0.9), ("їжа", 0.8), ("кафе", 0.5), ("їжа", 0.85)]) == ("їжа", 0.5)
    assert vote([]) == (None, 0.0)


async def _add(db, owner, category, similarity, amount=-100):
    db.add(Transaction(user_id=owner, amount=amount, category=category, spent_at=WHEN, note="x", embedding=vector(similarity)))


async def test_suggestion_uses_five_nearest_own_records(db, alice, bob):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    for similarity in (0.95, 0.93, 0.9, 0.88):
        await _add(db, owner, "кафе", similarity)
    await _add(db, owner, "їжа", 0.91)
    # Далі за п'ятьма найближчими — не голосує.
    for _ in range(3):
        await _add(db, owner, "транспорт", 0.2)
    # Чужі записи, навіть дуже схожі, не враховуються.
    for _ in range(5):
        await _add(db, uuid.UUID(bob[1]), "розваги", 0.99)
    await db.commit()

    category, confidence = await suggest_category(db, owner, QUERY)
    assert (category, confidence) == ("кафе", 0.8)


async def test_too_little_history_gives_no_suggestion(db, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    await _add(db, owner, "кафе", 0.9)
    await _add(db, owner, "кафе", 0.9)
    await db.commit()
    # Двох записів замало, щоб «більшість» щось означала.
    assert await suggest_category(db, owner, QUERY) == (None, 0.0)


async def test_suggest_endpoint(client, db, alice, monkeypatch):
    headers, user_id = alice
    owner = uuid.UUID(user_id)
    for _ in range(3):
        await _add(db, owner, "транспорт", 0.9)
    await db.commit()
    monkeypatch.setattr("app.routers.transactions.embed_one", lambda text: QUERY)

    response = await client.get(URL, params={"note": "таксі додому"}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == {"category": "транспорт", "confidence": 1.0}

    assert (await client.get(URL, params={"note": "  "}, headers=headers)).status_code == 422


async def test_suggest_endpoint_without_vector(client, alice):
    """Модель ембедингів недоступна — підказки просто немає, а не помилка."""
    headers, _ = alice
    response = await client.get(URL, params={"note": "кава"}, headers=headers)
    assert response.json() == {"category": None, "confidence": 0.0}
