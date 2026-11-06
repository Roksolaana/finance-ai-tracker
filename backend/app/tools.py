"""Інструменти, між якими LLM обирає для відповіді на запит користувача.

Три сценарії теми роботи:
  query_transactions     — чистий SQL: числа, підсумки, періоди
  semantic_search_notes  — чистий RAG: пошук за змістом нотатки
  hybrid_search_and_sum  — RAG знаходить записи, SQL їх підсумовує

І допоміжні SQL-інструменти: check_budgets — витрати проти лімітів за
місяць, find_recurring — регулярні платежі (підписки, гуртожиток).

Гібрид винесено окремим інструментом навмисно: якби модель сама складала
знайдені суми, результат залежав би від її арифметики. Тут вона лише обирає
набір записів, а суму рахує база.
"""

import datetime
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import CATEGORIES, DATE_RANGE_ERROR
from app.limits import limits_for_month
from app.models import Transaction
from app.recurring import find_series
from app.search import date_bounds, embed_query, semantic_search, semantic_total
from app.timeutils import TZ, in_date_range, local_midnight, local_today, next_month, period_end, previous_period

ToolKind = Literal["sql", "rag", "hybrid"]

# Скільки записів максимум віддаємо моделі в перелік.
LIST_LIMIT = 50


class ToolArgumentError(ValueError):
    """Аргумент від моделі не можна використати; текст піде їй у відповідь."""


@dataclass
class ToolOutcome:
    """Результат інструмента: текст для моделі + записи для інтерфейсу."""

    kind: ToolKind
    payload: dict[str, Any]
    transactions: list[Transaction]


def _optional_date(value: str | None) -> datetime.date | None:
    return _parse_date(value) if value else None


def _date_bounds(date_from: str | None, date_to: str | None):
    return date_bounds(_optional_date(date_from), _optional_date(date_to))


def _parse_date(value: str) -> datetime.date:
    """Розбирає дату від моделі.

    Модель не завжди дотримується формату з опису: трапляються «01.09.2026»,
    назва місяця або неіснуюче «2026-13-45». Мовчки проігнорувати таку дату
    не можна — користувач отримав би суму за весь час замість запитаного
    періоду, тож кидаємо зрозумілу помилку, яку модель пояснить словами.
    """
    try:
        day = datetime.date.fromisoformat(value)
    except ValueError:
        raise ToolArgumentError(
            f"Не вдалося розібрати дату «{value}». Потрібен формат YYYY-MM-DD."
        ) from None
    if not in_date_range(day):
        raise ToolArgumentError(f"{DATE_RANGE_ERROR}, отримано «{value}».")
    return day


def _describe(transaction: Transaction) -> dict[str, Any]:
    amount = float(transaction.amount)
    return {
        # Модуль і окрема позначка типу: зі знаком модель переписувала суму в
        # відповідь як «-1 404 ₴», хоча користувачу показують витрату.
        "amount": abs(amount),
        "kind": "дохід" if amount > 0 else "витрата",
        "category": transaction.category,
        # Місцева доба, а не UTC: інакше покупка о 00:30 показувалась би
        # учорашнім числом і суперечила статистиці.
        "date": transaction.spent_at.astimezone(TZ).date().isoformat(),
        "note": transaction.note,
        # Теги — те, що користувач сам сказав про настрій; модель може на них спертись.
        **({"tags": list(transaction.tags)} if transaction.tags else {}),
    }


async def query_transactions(
    db: AsyncSession,
    user_id: uuid.UUID,
    aggregation: str | None = "sum",
    category: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tx_type: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
) -> ToolOutcome:
    """Детермінована агрегація через SQL."""
    # Усі фільтри, крім періоду, збираються один раз: попередній період
    # рахується з ними ж і відрізняється лише датами. Раніше порівняння
    # будувало власний список і губило min_amount/max_amount, тож «витрати
    # понад тисячу» порівнювались із усіма витратами минулого місяця.
    filters = [Transaction.user_id == user_id]
    if category:
        filters.append(Transaction.category == category)
    # Порівнюємо за модулем: користувач каже «витрати понад тисячу», маючи на
    # увазі розмір суми, а не те, що вона відʼємна.
    if min_amount is not None:
        filters.append(func.abs(Transaction.amount) >= min_amount)
    if max_amount is not None:
        filters.append(func.abs(Transaction.amount) <= max_amount)
    if tx_type == "income":
        filters.append(Transaction.amount > 0)
    elif tx_type == "expense":
        filters.append(Transaction.amount < 0)
    conditions = [*filters, *_date_bounds(date_from, date_to)]

    aggregation = aggregation or "sum"
    if aggregation == "count":
        total = (await db.execute(select(func.count(Transaction.id)).where(*conditions))).scalar_one()
        return ToolOutcome("sql", {"count": int(total)}, [])

    if aggregation == "by_category":
        # Розподіл будуємо за витратами. Якщо модель попросила доходи,
        # повторний amount<0 дав би завжди порожній список.
        sign = Transaction.amount > 0 if tx_type == "income" else Transaction.amount < 0
        rows = (
            await db.execute(
                select(Transaction.category, func.sum(func.abs(Transaction.amount)))
                .where(*conditions, sign)
                .group_by(Transaction.category)
                .order_by(func.sum(func.abs(Transaction.amount)).desc())
            )
        ).all()
        return ToolOutcome("sql", {"by_category": [{"category": c, "amount": float(a)} for c, a in rows]}, [])

    rows = (
        await db.execute(select(Transaction).where(*conditions).order_by(Transaction.spent_at.desc()).limit(LIST_LIMIT))
    ).scalars().all()

    if aggregation == "list":
        shown = {"transactions": [_describe(t) for t in rows]}
        if len(rows) == LIST_LIMIT:
            shown["note"] = f"показано перші {LIST_LIMIT} записів"
        return ToolOutcome("sql", shown, list(rows))

    # sum — за замовчуванням.
    #
    # Витрати й доходи повертаються окремо, а не одним числом. Раніше тут була
    # сума модулів: якщо модель не вказувала tx_type, за вересень виходило
    # 36 637 ₴ — це 11 037 ₴ витрат, складені з 25 600 ₴ доходу. Саме такі
    # числа мав виключити принцип «рахує база, а не модель».
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0),
                func.coalesce(func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)), 0),
                func.count(Transaction.id),
            ).where(*conditions)
        )
    ).one()
    expenses, income, count = float(row[0]), float(row[1]), int(row[2])

    payload: dict[str, Any] = {
        "expenses": expenses,
        "income": income,
        "net": income - expenses,
        # Кількість — окремий COUNT, а не довжина вибірки: та обмежена
        # LIST_LIMIT, і модель казала б «по 50 записах» замість «по 492».
        "count": count,
    }

    # Контекст для відповіді. Без нього модель може сказати лише голе число,
    # а користувачу потрібно розуміти, з чого воно складається і чи це багато.
    payload["top_categories"] = await _top_categories(db, conditions)
    days = _period_days(date_from, date_to)
    if days and expenses:
        payload["days_in_period"] = days
        payload["average_per_day"] = round(expenses / days, 2)
    previous = await _previous_period(db, filters, date_from, date_to)
    if previous is not None:
        payload["previous_period"] = previous

    return ToolOutcome("sql", payload, list(rows))


async def _top_categories(db: AsyncSession, conditions: list, limit: int = 5) -> list[dict[str, Any]]:
    """Найбільші категорії витрат — щоб було чим пояснити суму."""
    rows = (
        await db.execute(
            select(Transaction.category, func.sum(func.abs(Transaction.amount)))
            .where(*conditions, Transaction.amount < 0)
            .group_by(Transaction.category)
            .order_by(func.sum(func.abs(Transaction.amount)).desc())
            .limit(limit)
        )
    ).all()
    return [{"category": c, "amount": float(a)} for c, a in rows]


def _period_days(date_from: str | None, date_to: str | None) -> int | None:
    """Скільки днів у періоді для середнього за день.

    Якщо період ще триває («цей місяць»), рахуємо лише дні, що минули, — як
    `avg_daily_expense` на дашборді. Інакше 23 жовтня витрати ділились би
    на 31 день.
    """
    if not date_from or not date_to:
        return None
    start = _parse_date(date_from)
    end = period_end(start, _parse_date(date_to), local_today())
    days = (end - start).days + 1
    return days if days > 0 else None


async def _previous_period(
    db: AsyncSession,
    filters: list,
    date_from: str | None,
    date_to: str | None,
) -> dict[str, float] | None:
    """Попередній період з тими самими фільтрами — для порівняння.

    Фраза «на 4% більше, ніж місяцем раніше» робить число зрозумілим, а
    рахувати його має база, а не модель. Який саме період вважати
    попереднім, вирішує `timeutils.previous_period` — те саме правило, що й
    у порівнянні на дашборді.
    """
    if not _period_days(date_from, date_to):
        return None

    previous_start, previous_end = previous_period(
        _parse_date(date_from), _parse_date(date_to), local_today()  # type: ignore[arg-type]
    )
    conditions = [*filters, *date_bounds(previous_start, previous_end)]

    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0),
                func.coalesce(func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)), 0),
            ).where(*conditions)
        )
    ).one()
    return {
        "from": previous_start.isoformat(),
        "to": previous_end.isoformat(),
        "expenses": float(row[0]),
        "income": float(row[1]),
    }


async def semantic_search_notes(
    db: AsyncSession,
    user_id: uuid.UUID,
    query_text: str,
    top_k: int | None = 20,
    date_from: str | None = None,
    date_to: str | None = None,
) -> ToolOutcome:
    """Пошук за змістом нотатки."""
    # Модель інколи надсилає 0 або відʼємне значення, а SQL LIMIT такого не приймає.
    limit = min(max(top_k or 20, 1), 100)
    # Без періоду «що я купувала, коли нервувала в жовтні» повертало записи
    # за весь час, і модель сама вибирала з них жовтневі — або не вибирала.
    hits = await semantic_search(
        db,
        user_id,
        query_text,
        top_k=limit,
        date_from=_optional_date(date_from),
        date_to=_optional_date(date_to),
    )
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
    """RAG знаходить записи за змістом, SQL рахує суму витрат серед них."""
    # Сума й перелік — два запити з однаковими умовами: підсумок іде по всіх
    # записах вище порога, а перелік обмежений, бо показати сотні нотаток
    # моделі й користувачу немає сенсу. Період входить в умови пошуку, тож
    # ліміт застосовується вже до записів потрібного місяця.
    #
    # Лише витрати: інструмент відповідає на «скільки пішло на…». Без цього
    # на «витрати через стрес цього місяця» пошук чіпляв «Стипендія за
    # місяць», і дохід складався з витратами в одну суму.
    search = {
        "expenses_only": True,
        "date_from": _optional_date(date_from),
        "date_to": _optional_date(date_to),
        "vector": await embed_query(query_text),
    }
    # Суму рахує база, а не модель — у цьому сенс гібридного інструмента.
    total, count = await semantic_total(db, user_id, query_text, **search)
    if not count:
        return ToolOutcome("hybrid", {"total": 0.0, "count": 0, "shown": 0}, [])

    hits = await semantic_search(db, user_id, query_text, top_k=LIST_LIMIT, **search)
    matched = [h.transaction for h in hits]
    payload: dict[str, Any] = {
        "total": float(total),
        "count": count,
        "shown": len(matched),
        "matched_notes": sorted({t.note for t in matched if t.note}),
        # Кілька найбільших — щоб у відповіді були приклади, а не лише сума.
        "largest": [
            _describe(t)
            for t in sorted(matched, key=lambda t: abs(float(t.amount)), reverse=True)[:5]
        ],
    }
    if len(matched) < count:
        # Без позначки модель сприймала перелік як повний і писала «знайдено
        # 50 записів» поруч із сумою по 250.
        payload["truncated"] = True
        payload["note"] = f"показано {len(matched)} з {count} записів; сума й кількість — по всіх"
    return ToolOutcome("hybrid", payload, matched)


async def check_budgets(db: AsyncSession, user_id: uuid.UUID, month: str | None = None) -> ToolOutcome:
    """Витрати проти лімітів за місяць.

    Без цього інструмента модель не бачила таблиці budgets і на «де я
    перевищила ліміт?» чесно відповідала, що лімітів немає. Залишок і
    перевищення рахує база — так само, як картка лімітів на дашборді.
    """
    if month:
        try:
            year, mon = (int(part) for part in month.split("-"))
            first_day = datetime.date(year, mon, 1)
        except ValueError:
            raise ToolArgumentError(f"Не вдалося розібрати місяць «{month}». Потрібен формат YYYY-MM.") from None
        if not in_date_range(first_day):
            raise ToolArgumentError(f"{DATE_RANGE_ERROR}, отримано «{month}».")
    else:
        first_day = local_today().replace(day=1)
    start = local_midnight(first_day)
    end = local_midnight(datetime.date(*next_month(first_day.year, first_day.month), 1))

    # Ліміти, що діяли саме в тому місяці: після зміни ліміту в жовтні
    # «чи вклалась я у вересні» має звірятись із вересневим.
    budgets = await limits_for_month(db, user_id, first_day)
    month_key = first_day.strftime("%Y-%m")
    if not budgets:
        return ToolOutcome("sql", {"month": month_key, "budgets": [], "note": "лімітів не встановлено"}, [])

    spent = dict(
        (
            await db.execute(
                select(Transaction.category, func.sum(-Transaction.amount))
                .where(
                    Transaction.user_id == user_id,
                    Transaction.amount < 0,
                    Transaction.spent_at >= start,
                    Transaction.spent_at < end,
                    Transaction.category.in_(list(budgets)),
                )
                .group_by(Transaction.category)
            )
        ).all()
    )

    rows = []
    for category, monthly_limit in budgets.items():
        limit = float(monthly_limit)
        used = float(spent.get(category, 0))
        rows.append(
            {
                "category": category,
                "limit": limit,
                "spent": used,
                "left": max(limit - used, 0.0),
                "over_by": max(used - limit, 0.0),
                "used_percent": round(used / limit * 100) if limit else None,
            }
        )
    # Спершу перевищені, далі ті, що найближче до межі: саме про них і питають.
    rows.sort(key=lambda r: (r["over_by"] == 0, -(r["used_percent"] or 0)))
    return ToolOutcome(
        "sql",
        {
            "month": month_key,
            "budgets": rows,
            "over_limit": [r["category"] for r in rows if r["over_by"] > 0],
        },
        [],
    )


async def find_recurring(db: AsyncSession, user_id: uuid.UUID) -> ToolOutcome:
    """Регулярні платежі: серії з близькою сумою раз на місяць.

    На «які в мене підписки?» SQL за категорією «підписки» не бачить
    гуртожитку чи проїзного, а пошук за змістом не знає, що щось
    повторюється. Серії шукає код (app/recurring.py), і суму за місяць теж
    рахує код — модель лише переказує.
    """
    series = await find_series(db, user_id)
    if not series:
        return ToolOutcome("sql", {"recurring": [], "note": "регулярних платежів не знайдено"}, [])
    monthly = sum(Decimal(str(s.average_amount)) for s in series)
    return ToolOutcome(
        "sql",
        {"recurring": [s.describe() for s in series], "monthly_total": float(monthly)},
        [],
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
                            "description": (
                                "sum — витрати, доходи й різниця окремими числами; "
                                "count — кількість; list — перелік; "
                                "by_category — розподіл витрат за категоріями"
                            ),
                        },
                        "category": {"type": ["string", "null"], "enum": [*CATEGORIES, None]},
                        "tx_type": {"type": ["string", "null"], "enum": ["income", "expense", None]},
                        "min_amount": {"type": ["number", "null"], "description": "Лише суми не менші за це (за модулем)"},
                        "max_amount": {"type": ["number", "null"], "description": "Лише суми не більші за це (за модулем)"},
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
                        **period,
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
                    "(«скільки я витратила через стрес»). Знаходить записи за змістом і підсумовує їх у базі. "
                    "Враховує лише витрати, доходи не рахує."
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
        {
            "type": "function",
            "function": {
                "name": "check_budgets",
                "description": (
                    "Місячні ліміти витрат за категоріями: скільки витрачено, скільки лишилось, "
                    "де ліміт перевищено. Використовуй для питань про ліміти й бюджет."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": {
                            "type": ["string", "null"],
                            "description": "Місяць у форматі YYYY-MM; без нього — поточний",
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "find_recurring",
                "description": (
                    "Регулярні платежі: підписки, гуртожиток, проїзний — усе, що повторюється щомісяця "
                    "з близькою сумою. Повертає назву, середню суму й дату наступного списання."
                ),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    ]


HANDLERS = {
    "query_transactions": query_transactions,
    "semantic_search_notes": semantic_search_notes,
    "hybrid_search_and_sum": hybrid_search_and_sum,
    "check_budgets": check_budgets,
    "find_recurring": find_recurring,
}


def system_prompt() -> str:
    today = local_today()
    return (
        "Ти фінансовий асистент застосунку Крона. Відповідай українською, "
        "звертайся на «ви».\n"
        f"Сьогодні {today.isoformat()}.\n"
        "\n"
        "Як будувати відповідь:\n"
        "- Починай з прямої відповіді на питання — число або висновок у першому "
        "реченні.\n"
        "- Далі поясни, з чого це складається: найбільші категорії, помітні "
        "витрати, середнє за день — те, що повернув інструмент.\n"
        "- Порівнюй з попереднім періодом ЛИШЕ якщо в результаті є поле "
        "previous_period. Немає його — не згадуй попередній період узагалі.\n"
        "- Коли перелічуєш записи, давай суму, категорію й дату, а не лише "
        "нотатку.\n"
        "- Три-чотири речення або короткий перелік з нового рядка. Не одне "
        "голе число, але й не стіна тексту.\n"
        "- Пиши живою мовою, без канцеляриту й без переліку своїх кроків: "
        "користувачу байдуже, який інструмент ти викликав.\n"
        "\n"
        "Правила:\n"
        "- КОЖНЕ число у відповіді мусить бути в результаті інструмента. Не "
        "рахуй сам середні, відсотки чи різниці, яких там немає, і не "
        "вигадуй сум за попередні періоди. Краще коротша відповідь, ніж "
        "правдоподібне число, узяте зі стелі.\n"
        "- Якщо інструмент нічого не повернув — так і скажи.\n"
        "- Не роби припущень про те, чого в даних не видно. Категорія «кафе» "
        "містить і каву, і ресторани; не стверджуй, із чого саме складається "
        "сума, якщо інструмент не дав розбивки.\n"
        "- `query_text` пиши українською, словами користувача, повною фразою з "
        "кількох слів. Одне слово шукає погано. Не перекладай англійською: "
        "нотатки в базі українські.\n"
        "- `category` вибирай лише зі списку дозволених значень. Якщо потрібної "
        "категорії немає, не вказуй її зовсім.\n"
        "- Про ліміти й бюджет питай check_budgets, а не query_transactions: "
        "ліміти лежать окремо від транзакцій. Якщо він повернув порожній "
        "список, скажи, що лімітів ще не встановлено.\n"
        "- Про підписки, регулярні й щомісячні платежі питай find_recurring: "
        "він бачить усе, що повторюється щомісяця, а не лише категорію «підписки».\n"
        "- `sum` повертає витрати, доходи й різницю окремо. Бери те число, про "
        "яке питає користувач, і не складай їх між собою.\n"
        "- Грошові суми пиши у форматі «1 234 ₴», без копійок, якщо вони нульові.\n"
        "- Без розмітки: ніяких зірочок, решіток і дефісів-маркерів — інтерфейс "
        "показує текст як є. Для переліку просто починай з нового рядка."
    )
