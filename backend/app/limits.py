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

from app.models import BudgetHistory


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
