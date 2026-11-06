"""Підказка категорії за схожими записами самого користувача.

Без мовної моделі: нотатка кодується тим самим ембедингом, що й для пошуку,
а категорію обирають голосуванням 5 найближчих власних транзакцій (kNN).
Свої записи, а не загальні правила: у когось «Сільпо» — це «їжа», а в
когось обіди в кулінарії там же, і це «кафе».
"""

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Transaction

NEIGHBOURS = 5
# Менше трьох схожих записів — «більшість» нічого не означає, тож мовчимо.
MIN_NEIGHBOURS = 3


def vote(neighbours: list[tuple[str, float]]) -> tuple[str | None, float]:
    """Категорія більшості серед сусідів і частка її голосів.

    Нічию розвʼязує сумарна схожість: ближчі сусіди важать більше.
    """
    if not neighbours:
        return None, 0.0
    votes: dict[str, int] = defaultdict(int)
    weight: dict[str, float] = defaultdict(float)
    for category, similarity in neighbours:
        votes[category] += 1
        weight[category] += similarity
    winner = max(votes, key=lambda c: (votes[c], weight[c]))
    return winner, round(votes[winner] / len(neighbours), 2)


async def suggest_category(
    db: AsyncSession,
    user_id: uuid.UUID,
    vector: list[float],
    exclude_note: str | None = None,
    exclude_id: uuid.UUID | None = None,
) -> tuple[str | None, float]:
    """Підказка для нотатки з вектором `vector`; (None, 0) — підказки немає.

    `exclude_id` і `exclude_note` — для оцінки leave-one-out
    (eval/run_categories.py): прибрати сам запис або всі записи з тим самим
    текстом, щоб нотатка не «вгадувала» власні копії.
    """
    distance = Transaction.embedding.cosine_distance(vector)
    conditions = [Transaction.user_id == user_id, Transaction.embedding.is_not(None)]
    if exclude_note is not None:
        conditions.append(Transaction.note != exclude_note)
    if exclude_id is not None:
        conditions.append(Transaction.id != exclude_id)
    rows = (
        await db.execute(
            select(Transaction.category, distance).where(*conditions).order_by(distance).limit(NEIGHBOURS)
        )
    ).all()
    if len(rows) < MIN_NEIGHBOURS:
        return None, 0.0
    return vote([(category, 1 - dist) for category, dist in rows])
