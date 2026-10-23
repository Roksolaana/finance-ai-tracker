"""Семантичний пошук транзакцій за змістом нотатки (RAG-частина).

На відміну від SQL-фільтрів, шукає за сенсом: «витрати через стрес» знаходить
«Заїла стрес перед дедлайном» та «Імпульсивний шопінг після стресової сесії»,
хоча слова в запиті й нотатці не збігаються.
"""

import re
import uuid
from dataclasses import dataclass

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import and_, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings import (
    RELEVANCE_THRESHOLD,
    SHORT_QUERY_THRESHOLD,
    SHORT_QUERY_WORDS,
    embed_one,
)
from app.models import Transaction


@dataclass
class SearchHit:
    transaction: Transaction
    similarity: float


# Початки слів, які описують сам запит, а не зміст нотатки: «витрати»,
# «покупки», «цього місяця». Без них «витрати через стрес у жовтні»
# збігалося б із кожною нотаткою, де трапилось «через».
_QUERY_WORDS = (
    "витрат", "покуп", "купу", "купи", "грош", "скільк", "знайд", "покаж",
    "через", "після", "перед", "коли", "який", "яка", "які", "якій", "щось",
    "мене", "свої", "свою", "було", "всьог", "усьог", "цього", "минул", "останн",
    "місяц", "тижн", "тиждень", "сьогод", "вчор", "році", "року",
    "січн", "лют", "берез", "квіт", "трав", "черв", "лип", "серп", "верес",
    "жовт", "листоп", "груд",
)


def _keywords(query_text: str) -> list[str]:
    """Основи змістовних слів запиту для прямого збігу з нотаткою.

    Закінчення відкидаємо грубо, двома останніми літерами: «стресу» і
    «стресова» мають знайти «стрес». Повноцінний стемер для української
    тут зайвий — потрібно лише не загубити слово, яке стоїть у нотатці.
    """
    stems = []
    for word in re.findall(r"[а-яіїєґʼ'a-z]+", query_text.lower()):
        if len(word) < 4 or word.startswith(_QUERY_WORDS):
            continue
        stems.append(word[: max(5, len(word) - 2)])
    return stems


async def semantic_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_text: str,
    # Навмисно щедро: однакова нотатка повторюється в різних транзакціях
    # («Лате в «Львівській майстерні кави»» — 5 разів), і при малому top_k
    # копії витіснили б інші релевантні нотатки. Відсікає поріг, а не ліміт.
    top_k: int = 50,
    threshold: float | None = None,
    expenses_only: bool = False,
) -> list[SearchHit]:
    """Повертає транзакції, зміст нотаток яких близький до запиту.

    Нерелевантні відсікаються за порогом: без нього пошук завжди повертав би
    `top_k` записів, навіть коли в даних немає нічого схожого.
    """
    # Модель ембедингів синхронна й важка: без відведення в потік вона
    # блокує весь сервер, включно зі статикою та /health.
    vector = await run_in_threadpool(embed_one, query_text)
    if vector is None:
        return []

    if threshold is None:
        words = len(query_text.split())
        threshold = SHORT_QUERY_THRESHOLD if words < SHORT_QUERY_WORDS else RELEVANCE_THRESHOLD

    # cosine_distance = 1 - cosine_similarity, тож більша схожість = менша відстань.
    distance = Transaction.embedding.cosine_distance(vector)
    similar = and_(Transaction.embedding.is_not(None), distance <= 1 - threshold)

    # Вектор довгої нотатки тягне до її головної теми: «Зайшла в магазин
    # косметики, трохи щоб розвіятись і зняти стрес» на запит «витрати через
    # стрес» має лише 0.28 — нижче за випадкові нотатки. Тому нотатка, де
    # прямо стоїть слово із запиту, теж вважається знайденою.
    stems = _keywords(query_text)
    mentions = or_(*(Transaction.note.ilike(f"%{stem}%") for stem in stems)) if stems else None
    relevant = or_(similar, mentions) if mentions is not None else similar
    # Прямий збіг слова надійніший за схожість, тож іде першим і не
    # витісняється лімітом.
    order = [case((mentions, 0), else_=1), distance] if mentions is not None else [distance]

    rows = (
        await db.execute(
            select(Transaction, distance.label("distance"))
            .where(
                Transaction.user_id == user_id,
                relevant,
                # Відсіюємо доходи ще до ліміту: інакше вони займали б місця в
                # top_k і могли б витіснити справжні витрати.
                *([Transaction.amount < 0] if expenses_only else []),
            )
            .order_by(*order)
            .limit(top_k)
        )
    ).all()

    return [
        SearchHit(transaction=row[0], similarity=0.0 if row[1] is None else 1 - row[1])
        for row in rows
    ]
