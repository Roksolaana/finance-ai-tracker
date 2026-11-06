"""Ліміти бюджету — лише з історії версій (budget_history).

Ліміт, що діяв у місяці M, — остання версія з valid_from <= M; поточний
ліміт — остання версія взагалі. Окремої таблиці «поточних» лімітів немає
навмисно: два записи того самого факту розходяться, і тоді дашборд, діалог
лімітів і асистент показували б різне.
"""

import datetime
import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BudgetHistory, Transaction
from app.timeutils import TZ, local_midnight, next_month


async def limits_for_month(
    db: AsyncSession, user_id: uuid.UUID, month: datetime.date | None = None
) -> dict[str, Decimal]:
    """Ліміти за категорією, що діяли в місяці `month`; без нього — поточні.

    Знятий ліміт (остання версія з NULL) до результату не потрапляє.
    """
    conditions = [BudgetHistory.user_id == user_id]
    if month is not None:
        conditions.append(BudgetHistory.valid_from <= month.replace(day=1))
    latest = (
        select(BudgetHistory.category, BudgetHistory.monthly_limit)
        .where(*conditions)
        .distinct(BudgetHistory.category)
        .order_by(BudgetHistory.category, BudgetHistory.valid_from.desc())
        .subquery()
    )
    # Сортує база: порядок кирилиці в Python (за кодами символів)
    # відрізняється від колації, і ліміти на екрані перемішались би.
    rows = (
        await db.execute(
            select(latest.c.category, latest.c.monthly_limit)
            .where(latest.c.monthly_limit.is_not(None))
            .order_by(latest.c.category)
        )
    ).all()
    return {category: Decimal(limit) for category, limit in rows}


async def record_limit(
    db: AsyncSession,
    user_id: uuid.UUID,
    category: str,
    limit: Decimal | None,
    month: datetime.date,
) -> None:
    """Записує версію ліміту, що діє з `month`; None — ліміт знято.

    Повторна зміна в тому самому місяці переписує його версію, а не додає
    нову: інакше ліміт, виправлений тричі за вечір, мав би три версії з
    однаковою датою. Якщо нове значення збігається з тим, що діяло до цього
    місяця, версія цього місяця просто зникає — вона нічого не змінює.
    """
    month = month.replace(day=1)
    before = (
        await db.execute(
            select(BudgetHistory.monthly_limit)
            .where(
                BudgetHistory.user_id == user_id,
                BudgetHistory.category == category,
                BudgetHistory.valid_from < month,
            )
            .order_by(BudgetHistory.valid_from.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if before == limit:
        await db.execute(
            delete(BudgetHistory).where(
                BudgetHistory.user_id == user_id,
                BudgetHistory.category == category,
                BudgetHistory.valid_from == month,
            )
        )
        return

    statement = insert(BudgetHistory).values(
        user_id=user_id, category=category, valid_from=month, monthly_limit=limit
    )
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=[BudgetHistory.user_id, BudgetHistory.category, BudgetHistory.valid_from],
            set_={"monthly_limit": statement.excluded.monthly_limit, "created_at": func.now()},
        )
    )


# З якої частки ліміту попереджати. Раніше за 80% попередження нічого не
# дає, пізніше — його вже нема коли врахувати до кінця місяця.
WARNING_SHARE = Decimal("0.8")

_MONTHS = (
    "січень", "лютий", "березень", "квітень", "травень", "червень",
    "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
)


def _money(value: Decimal) -> str:
    """«1 280 ₴» або «1 280,50 ₴» — у тому самому вигляді, що й в інтерфейсі."""
    rounded = value.quantize(Decimal("0.01"))
    whole, cents = divmod(abs(rounded), 1)
    text = f"{int(whole):,}".replace(",", " ")
    if cents:
        text += f",{int(cents * 100):02d}"
    return f"{text} ₴"


async def budget_warning(
    db: AsyncSession, user_id: uuid.UUID, category: str, spent_at: datetime.datetime
) -> dict | None:
    """Попередження, якщо витрати категорії за місяць дійшли до 80% ліміту.

    Місяць — той, у який потрапила витрата, а не поточний: запис заднім
    числом звіряється з лімітом і витратами свого місяця. Усі числа й текст
    складає код із даних бази.
    """
    first_day = spent_at.astimezone(TZ).date().replace(day=1)
    limit = (await limits_for_month(db, user_id, first_day)).get(category)
    if not limit:
        return None
    start = local_midnight(first_day)
    end = local_midnight(datetime.date(*next_month(first_day.year, first_day.month), 1))
    spent = Decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(-Transaction.amount), 0)).where(
                    Transaction.user_id == user_id,
                    Transaction.category == category,
                    Transaction.amount < 0,
                    Transaction.spent_at >= start,
                    Transaction.spent_at < end,
                )
            )
        ).scalar_one()
    )
    if spent < limit * WARNING_SHARE:
        return None

    over_by = max(spent - limit, Decimal(0))
    used_percent = int(spent / limit * 100 + Decimal("0.5"))
    month_name = _MONTHS[first_day.month - 1]
    if over_by > 0:
        message = (
            f"Ліміт на «{category}» за {month_name} перевищено на {_money(over_by)}: "
            f"{_money(spent)} з {_money(limit)}"
        )
    else:
        message = f"Витрачено {used_percent}% ліміту на «{category}» за {month_name}: {_money(spent)} з {_money(limit)}"
    return {
        "category": category,
        "month": first_day.strftime("%Y-%m"),
        "limit": float(limit),
        "spent": float(spent),
        "used_percent": used_percent,
        "over_by": float(over_by),
        "message": message,
    }
