"""Інструменти, між якими LLM обирає для відповіді на запит користувача.

Три сценарії теми роботи:
  query_transactions     — чистий SQL: числа, підсумки, періоди
  semantic_search_notes  — чистий RAG: пошук за змістом нотатки
  hybrid_search_and_sum  — RAG знаходить записи, SQL їх підсумовує

Гібрид винесено окремим інструментом навмисно: якби модель сама складала
знайдені суми, результат залежав би від її арифметики. Тут вона лише обирає
набір записів, а суму рахує база.
"""

import datetime
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import CATEGORIES
from app.models import Transaction
from app.search import semantic_search
from app.timeutils import local_midnight, local_today

ToolKind = Literal["sql", "rag", "hybrid"]


@dataclass
class ToolOutcome:
    """Результат інструмента: текст для моделі + записи для інтерфейсу."""

    kind: ToolKind
    payload: dict[str, Any]
    transactions: list[Transaction]


def _date_bounds(date_from: str | None, date_to: str | None):
    conditions = []
    if date_from:
        conditions.append(Transaction.spent_at >= local_midnight(datetime.date.fromisoformat(date_from)))
    if date_to:
        end = datetime.date.fromisoformat(date_to) + datetime.timedelta(days=1)
        conditions.append(Transaction.spent_at < local_midnight(end))
    return conditions


def _describe(transaction: Transaction) -> dict[str, Any]:
    return {
        "amount": float(transaction.amount),
        "category": transaction.category,
        "date": transaction.spent_at.date().isoformat(),
        "note": transaction.note,
    }


async def query_transactions(
    db: AsyncSession,
    user_id: uuid.UUID,
    aggregation: str | None = "sum",
    category: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tx_type: str | None = None,
) -> ToolOutcome:
    """Детермінована агрегація через SQL."""
    conditions = [Transaction.user_id == user_id, *_date_bounds(date_from, date_to)]
    if category:
        conditions.append(Transaction.category == category)
    if tx_type == "income":
        conditions.append(Transaction.amount > 0)
    elif tx_type == "expense":
        conditions.append(Transaction.amount < 0)

    aggregation = aggregation or "sum"
    if aggregation == "count":
        total = (await db.execute(select(func.count(Transaction.id)).where(*conditions))).scalar_one()
        return ToolOutcome("sql", {"count": int(total)}, [])

    if aggregation == "by_category":
        rows = (
            await db.execute(
                select(Transaction.category, func.sum(func.abs(Transaction.amount)))
                .where(*conditions, Transaction.amount < 0)
                .group_by(Transaction.category)
                .order_by(func.sum(func.abs(Transaction.amount)).desc())
            )
        ).all()
        return ToolOutcome("sql", {"by_category": [{"category": c, "amount": float(a)} for c, a in rows]}, [])

    rows = (
        await db.execute(select(Transaction).where(*conditions).order_by(Transaction.spent_at.desc()).limit(50))
    ).scalars().all()

    if aggregation == "list":
        return ToolOutcome("sql", {"transactions": [_describe(t) for t in rows]}, list(rows))

    # sum — за замовчуванням
    total = (
        await db.execute(select(func.coalesce(func.sum(func.abs(Transaction.amount)), 0)).where(*conditions))
    ).scalar_one()
    return ToolOutcome("sql", {"total": float(total), "count": len(rows)}, list(rows))


async def semantic_search_notes(
    db: AsyncSession, user_id: uuid.UUID, query_text: str, top_k: int | None = 20
) -> ToolOutcome:
    """Пошук за змістом нотатки."""
    hits = await semantic_search(db, user_id, query_text, top_k=top_k or 20)
    return ToolOutcome(
        "rag",
        {
            "found": len(hits),
            "transactions": [_describe(h.transaction) | {"similarity": round(h.similarity, 3)} for h in hits],
        },
        [h.transaction for h in hits],
    )


async def hybrid_search_and_sum(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_text: str,
    date_from: str | None = None,
    date_to: str | None = None,
) -> ToolOutcome:
    """RAG знаходить записи за змістом, SQL рахує їхню суму."""
    hits = await semantic_search(db, user_id, query_text, top_k=200)
    if not hits:
        return ToolOutcome("hybrid", {"found": 0, "total": 0.0}, [])

    ids = [h.transaction.id for h in hits]
    conditions = [
        Transaction.user_id == user_id,
        Transaction.id.in_(ids),
        *_date_bounds(date_from, date_to),
    ]
    # Суму рахує база, а не модель — у цьому сенс гібридного інструмента.
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(func.abs(Transaction.amount)), 0),
                func.count(Transaction.id),
            ).where(*conditions)
        )
    ).one()

    matched = [h.transaction for h in hits]
    return ToolOutcome(
        "hybrid",
        {
            "total": float(row[0]),
            "count": int(row[1]),
            "matched_notes": sorted({h.transaction.note for h in hits if h.transaction.note}),
        },
        matched,
    )


def tool_schemas() -> list[dict[str, Any]]:
    """JSON-схеми інструментів для function calling.

    `category` оголошено enum-ом з українськими значеннями навмисно: без цього
    модель підставляла перекладені назви («coffee» замість «кафе»), які не
    збігаються з жодним записом у базі.
    """
    # Необовʼязкові поля мусять приймати null: модель явно передає його
    # замість того, щоб пропустити поле, а Groq звіряє аргументи зі схемою
    # й відхиляє виклик помилкою 400.
    period = {
        "date_from": {"type": ["string", "null"], "description": "Початок періоду, YYYY-MM-DD"},
        "date_to": {"type": ["string", "null"], "description": "Кінець періоду включно, YYYY-MM-DD"},
    }
    return [
        {
            "type": "function",
            "function": {
                "name": "query_transactions",
                "description": (
                    "Точні числа з бази: суми, кількість, список, розподіл за категоріями. "
                    "Використовуй, коли запит стосується сум, періодів або конкретної категорії."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "aggregation": {
                            "type": "string",
                            "enum": ["sum", "count", "list", "by_category"],
                            "description": "sum — сума, count — кількість, list — перелік, by_category — розподіл витрат",
                        },
                        "category": {"type": ["string", "null"], "enum": [*CATEGORIES, None]},
                        "tx_type": {"type": ["string", "null"], "enum": ["income", "expense", None]},
                        **period,
                    },
                    "required": ["aggregation"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "semantic_search_notes",
                "description": (
                    "Пошук транзакцій за змістом нотатки, коли в запиті немає категорії чи числа: "
                    "настрій, причина витрати, опис своїми словами. Повертає перелік без підсумку."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query_text": {
                            "type": "string",
                            "description": (
                                "Фраза українською зі слів користувача, не одне слово. "
                                "Для «знайди витрати через стрес» це «витрати через стрес», а не «стрес»."
                            ),
                        },
                        "top_k": {"type": ["integer", "null"]},
                    },
                    "required": ["query_text"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "hybrid_search_and_sum",
                "description": (
                    "Коли треба порахувати суму для витрат, які описані змістом, а не категорією "
                    "(«скільки я витратила через стрес»). Знаходить записи за змістом і підсумовує їх у базі."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query_text": {
                            "type": "string",
                            "description": (
                                "Фраза українською зі слів користувача, не одне слово. "
                                "Для «витрати через стрес» саме так і пиши, а не «стрес»."
                            ),
                        },
                        **period,
                    },
                    "required": ["query_text"],
                },
            },
        },
    ]


HANDLERS = {
    "query_transactions": query_transactions,
    "semantic_search_notes": semantic_search_notes,
    "hybrid_search_and_sum": hybrid_search_and_sum,
}


def system_prompt() -> str:
    today = local_today()
    return (
        "Ти фінансовий асистент застосунку Крона. Відповідай українською, стисло, "
        "по суті, без переліку кроків.\n"
        f"Сьогодні {today.isoformat()}.\n"
        "\n"
        "Правила:\n"
        "- Числа бери лише з результатів інструментів. Якщо інструмент нічого не "
        "повернув — так і скажи, не вигадуй суми.\n"
        "- `query_text` пиши українською, словами користувача, повною фразою з "
        "кількох слів. Одне слово шукає погано. Не перекладай англійською: "
        "нотатки в базі українські.\n"
        "- `category` вибирай лише зі списку дозволених значень. Якщо потрібної "
        "категорії немає, не вказуй її зовсім.\n"
        "- Суми в базі: витрати відʼємні, доходи додатні. Інструменти вже "
        "повертають витрати за модулем.\n"
        "- Грошові суми пиши у форматі «1 234 ₴».\n"
        "- Пиши звичайним текстом без розмітки: ніяких зірочок, решіток і "
        "маркованих списків — інтерфейс показує відповідь як є."
    )
