"""Семантичний пошук транзакцій за змістом нотатки (RAG-частина).

На відміну від SQL-фільтрів, шукає за сенсом: «витрати через стрес» знаходить
«Заїла стрес перед дедлайном» та «Імпульсивний шопінг після стресової сесії»,
хоча слова в запиті й нотатці не збігаються.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings import RELEVANCE_THRESHOLD, embed_one
from app.models import Transaction


@dataclass
class SearchHit:
    transaction: Transaction
    similarity: float


async def semantic_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_text: str,
    # Навмисно щедро: однакова нотатка повторюється в різних транзакціях
    # («Лате в «Львівській майстерні кави»» — 5 разів), і при малому top_k
    # копії витіснили б інші релевантні нотатки. Відсікає поріг, а не ліміт.
    top_k: int = 50,
    threshold: float = RELEVANCE_THRESHOLD,
) -> list[SearchHit]:
    """Повертає транзакції, зміст нотаток яких близький до запиту.

    Нерелевантні відсікаються за порогом: без нього пошук завжди повертав би
    `top_k` записів, навіть коли в даних немає нічого схожого.
    """
    vector = embed_one(query_text)
    if vector is None:
        return []

    # cosine_distance = 1 - cosine_similarity, тож більша схожість = менша відстань.
    distance = Transaction.embedding.cosine_distance(vector)
    rows = (
        await db.execute(
            select(Transaction, distance.label("distance"))
            .where(Transaction.user_id == user_id, Transaction.embedding.is_not(None))
            .order_by(distance)
            .limit(top_k)
        )
    ).all()

    hits = [SearchHit(transaction=row[0], similarity=1 - row[1]) for row in rows]
    return [hit for hit in hits if hit.similarity >= threshold]
