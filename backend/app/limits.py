"""Ліміти бюджету з урахуванням історії.

Ліміт, що діяв у місяці M, — остання версія з budget_history, у якої
valid_from <= M. Одне правило для дашборду й асистента: якщо вони
рахуватимуть ліміт по-різному, «у вересні ви вклались» на екрані
суперечитиме відповіді в чаті.
"""

import datetime
import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select, union_all
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Budget, BudgetHistory


async def limits_for_month(db: AsyncSession, user_id: uuid.UUID, month: datetime.date) -> dict[str, Decimal]:
    """Ліміти, що діяли в місяці `month`, за категорією (впорядковано за назвою)."""
    month = month.replace(day=1)
    latest = (
        select(BudgetHistory.category, BudgetHistory.monthly_limit)
        .where(BudgetHistory.user_id == user_id, BudgetHistory.valid_from <= month)
        .distinct(BudgetHistory.category)
        .order_by(BudgetHistory.category, BudgetHistory.valid_from.desc())
        .subquery()
    )
    # Ліміт, у якого взагалі немає історії, діє на кожен місяць — як до
    # появи budget_history. Міграція 0006 переносить усі наявні ліміти, тож
    # через API такий рядок не виникає; це запас для записів, внесених
    # напряму в budgets.
    tracked = select(BudgetHistory.category).where(BudgetHistory.user_id == user_id)
    untracked = select(Budget.category, Budget.monthly_limit).where(
        Budget.user_id == user_id, Budget.category.not_in(tracked)
    )
    effective = union_all(
        select(latest.c.category, latest.c.monthly_limit).where(latest.c.monthly_limit.is_not(None)),
        untracked,
    ).subquery()
    # Сортує база, як і раніше: порядок кирилиці в Python (за кодами
    # символів) відрізняється від колації, і ліміти на екрані перемішались би.
    rows = (
        await db.execute(
            select(effective.c.category, effective.c.monthly_limit).order_by(effective.c.category)
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
