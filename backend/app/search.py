"""Семантичний пошук транзакцій за змістом нотатки (RAG-частина).

На відміну від SQL-фільтрів, шукає за сенсом: «витрати через стрес» знаходить
«Заїла стрес перед дедлайном» та «Імпульсивний шопінг після стресової сесії»,
хоча слова в запиті й нотатці не збігаються.
"""

import datetime
import re
import uuid
from dataclasses import dataclass

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings import (
    KEYWORD_BONUS,
    RELEVANCE_THRESHOLD,
    SHORT_QUERY_THRESHOLD,
    SHORT_QUERY_WORDS,
    embed_one,
)
from app.models import Transaction
from app.timeutils import local_midnight


@dataclass
class SearchHit:
    transaction: Transaction
    similarity: float
    # Схожість разом із бонусом за слова із запиту — за нею йде сортування.
    score: float | None = None


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

# «стрес чи втому», «кава або чай», «таксі, кафе» — це кілька окремих
# запитів в одному. Нотатка не мусить містити всі варіанти одразу.
_ALTERNATIVES = re.compile(r"\s+(?:чи|або)\s+|,")


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
        stem = word[: max(5, len(word) - 2)]
        if stem not in stems:
            stems.append(stem)
    return stems


def _alternatives(query_text: str) -> list[list[str]]:
    """Основи слів окремо для кожного варіанта запиту; без порожніх."""
    return [stems for part in _ALTERNATIVES.split(query_text) if (stems := _keywords(part))]


def _keyword_share(alternatives: list[list[str]]):
    """SQL-вираз: яка частка основ найкращого варіанта трапляється в нотатці (0…1)."""
    shares = []
    for stems in alternatives:
        found = sum(case((Transaction.note.ilike(f"%{stem}%"), 1.0), else_=0.0) for stem in stems)
        shares.append(found / len(stems))
    if not shares:
        return None
    return shares[0] if len(shares) == 1 else func.greatest(*shares)


def date_bounds(date_from: datetime.date | None, date_to: datetime.date | None) -> list:
    """Умови на spent_at за місцевою добою, обидві межі включно."""
    conditions = []
    if date_from:
        conditions.append(Transaction.spent_at >= local_midnight(date_from))
    if date_to:
        conditions.append(Transaction.spent_at < local_midnight(date_to + datetime.timedelta(days=1)))
    return conditions


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
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
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

    # cosine_distance = 1 - cosine_similarity, тож більша схожість = менша відстань.
    distance = Transaction.embedding.cosine_distance(vector)
    similarity = 1 - distance

    # Вектор довгої нотатки тягне до її головної теми: «Зайшла в магазин
    # косметики, трохи щоб розвіятись і зняти стрес» на запит «витрати через
    # стрес» має лише 0.28 — нижче за випадкові нотатки. Тому слово із запиту,
    # яке прямо стоїть у нотатці, додає до схожості бонус. Саме додає, а не
    # пропускає повз поріг: раніше будь-який збіг основи проходив, і на
    # «витрати на подарунки друзям» знаходився «Обід у кафе з друзями».
    share = _keyword_share(_alternatives(query_text))
    score = similarity + KEYWORD_BONUS * share if share is not None else similarity

    if threshold is not None:
        passes = score >= threshold
    elif len(query_text.split()) < SHORT_QUERY_WORDS:
        # Високий поріг для одного слова захищає від «загальних» векторів.
        # Якщо ж це слово прямо стоїть у нотатці, збіг не випадковий, і
        # достатньо звичайного порога.
        if share is not None:
            passes = score >= case((share >= 1, RELEVANCE_THRESHOLD), else_=SHORT_QUERY_THRESHOLD)
        else:
            passes = score >= SHORT_QUERY_THRESHOLD
    else:
        passes = score >= RELEVANCE_THRESHOLD

    rows = (
        await db.execute(
            select(Transaction, distance.label("distance"), score.label("score"))
            .where(
                Transaction.user_id == user_id,
                Transaction.embedding.is_not(None),
                passes,
                # Доходи й записи поза періодом відсіюємо ще до ліміту: інакше
                # вони займали б місця в top_k і могли б витіснити справжні збіги.
                *([Transaction.amount < 0] if expenses_only else []),
                *date_bounds(date_from, date_to),
            )
            .order_by(score.desc())
            .limit(top_k)
        )
    ).all()

    return [
        SearchHit(transaction=row[0], similarity=1 - row[1], score=float(row[2]))
        for row in rows
    ]
