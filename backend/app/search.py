"""Семантичний пошук транзакцій за змістом нотатки (RAG-частина).

На відміну від SQL-фільтрів, шукає за сенсом: «витрати через стрес» знаходить
«Заїла стрес перед дедлайном» та «Імпульсивний шопінг після стресової сесії»,
хоча слова в запиті й нотатці не збігаються.
"""

import datetime
import re
import uuid
from dataclasses import dataclass
from decimal import Decimal

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import Text, and_, case, cast, func, or_, select
from sqlalchemy.dialects.postgresql import ARRAY, array
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import TAG_STEMS
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


def query_tags(query_text: str) -> list[str]:
    """Теги настрою, які запит називає прямо: «коли я була втомлена» -> «втома»."""
    words = re.findall(r"[а-яіїєґʼ'a-z]+", query_text.lower())
    return [
        tag for tag, stems in TAG_STEMS.items() if any(word.startswith(stem) for word in words for stem in stems)
    ]


def date_bounds(date_from: datetime.date | None, date_to: datetime.date | None) -> list:
    """Умови на spent_at за місцевою добою, обидві межі включно."""
    conditions = []
    if date_from:
        conditions.append(Transaction.spent_at >= local_midnight(date_from))
    if date_to:
        conditions.append(Transaction.spent_at < local_midnight(date_to + datetime.timedelta(days=1)))
    return conditions


async def embed_query(query_text: str) -> list[float] | None:
    """Вектор запиту; рахується один раз, навіть якщо пошуків кілька."""
    # Модель ембедингів синхронна й важка: без відведення в потік вона
    # блокує весь сервер, включно зі статикою та /health.
    return await run_in_threadpool(embed_one, query_text)


def _relevance(
    user_id: uuid.UUID,
    query_text: str,
    vector: list[float],
    threshold: float | None,
    expenses_only: bool,
    date_from: datetime.date | None,
    date_to: datetime.date | None,
    use_keywords: bool = True,
):
    """Відстань, оцінка й умови «запис стосується запиту».

    Одні й ті самі умови для переліку й для підсумку: якщо вони розійдуться,
    сума під відповіддю перестане відповідати показаним записам.
    """
    # cosine_distance = 1 - cosine_similarity, тож більша схожість = менша відстань.
    distance = Transaction.embedding.cosine_distance(vector)
    similarity = 1 - distance

    # Вектор довгої нотатки тягне до її головної теми: «Зайшла в магазин
    # косметики, трохи щоб розвіятись і зняти стрес» на запит «витрати через
    # стрес» має лише 0.28 — нижче за випадкові нотатки. Тому слово із запиту,
    # яке прямо стоїть у нотатці, додає до схожості бонус. Саме додає, а не
    # пропускає повз поріг: раніше будь-який збіг основи проходив, і на
    # «витрати на подарунки друзям» знаходився «Обід у кафе з друзями».
    # use_keywords=False — лише для оцінки (eval/run_retrieval.py): так видно,
    # що саме дає бонус порівняно з чистим вектором.
    share = _keyword_share(_alternatives(query_text)) if use_keywords else None
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

    # Тег, який запит називає прямо, — явна позначка користувача, а не
    # здогад моделі ембедингів, тож такий запис проходить без порога. Так
    # знаходиться й запис без нотатки, у якого вектора немає взагалі. У сам
    # вектор теги не входять: інакше змінився б розподіл схожості, і пороги
    # вище, підібрані на нотатках, перестали б бути чинними.
    tags = query_tags(query_text) if use_keywords else []
    matched = and_(Transaction.embedding.is_not(None), passes)
    tagged = Transaction.tags.overlap(cast(array(tags), ARRAY(Text))) if tags else None

    conditions = [
        Transaction.user_id == user_id,
        or_(matched, tagged) if tagged is not None else matched,
        # Доходи й записи поза періодом відсіюємо ще до ліміту: інакше
        # вони займали б місця в top_k і могли б витіснити справжні збіги.
        *([Transaction.amount < 0] if expenses_only else []),
        *date_bounds(date_from, date_to),
    ]
    # Записи з названим тегом — першими; у запису без вектора оцінки немає,
    # і без nulls_last він стояв би нагорі лише через NULL.
    ordering = [*([tagged.desc()] if tagged is not None else []), score.desc().nulls_last()]
    return distance, score, conditions, ordering


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
    vector: list[float] | None = None,
    use_keywords: bool = True,
) -> list[SearchHit]:
    """Повертає транзакції, зміст нотаток яких близький до запиту.

    Нерелевантні відсікаються за порогом: без нього пошук завжди повертав би
    `top_k` записів, навіть коли в даних немає нічого схожого.
    """
    if vector is None:
        vector = await embed_query(query_text)
    if vector is None:
        return []

    distance, score, conditions, ordering = _relevance(
        user_id, query_text, vector, threshold, expenses_only, date_from, date_to, use_keywords
    )
    rows = (
        await db.execute(
            select(Transaction, distance.label("distance"), score.label("score"))
            .where(*conditions)
            .order_by(*ordering)
            .limit(top_k)
        )
    ).all()

    # Запис, знайдений лише за тегом, не має вектора, а отже й схожості.
    return [
        SearchHit(
            transaction=row[0],
            similarity=1 - row[1] if row[1] is not None else 0.0,
            score=float(row[2]) if row[2] is not None else None,
        )
        for row in rows
    ]


async def semantic_total(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_text: str,
    threshold: float | None = None,
    expenses_only: bool = False,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    vector: list[float] | None = None,
) -> tuple[Decimal, int]:
    """Сума модулів і кількість усіх записів, що пройшли поріг.

    Без LIMIT: перелік для показу обмежений, а підсумок — ні. Раніше гібрид
    складав лише перші 200 знайдених, і за більшої кількості збігів сума
    мовчки виходила меншою, ніж насправді.
    """
    if vector is None:
        vector = await embed_query(query_text)
    if vector is None:
        return Decimal(0), 0

    _, _, conditions, _ = _relevance(user_id, query_text, vector, threshold, expenses_only, date_from, date_to)
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(func.abs(Transaction.amount)), 0),
                func.count(Transaction.id),
            ).where(*conditions)
        )
    ).one()
    return Decimal(row[0]), int(row[1])
