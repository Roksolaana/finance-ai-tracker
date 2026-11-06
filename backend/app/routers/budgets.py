"""Ендпоінти для місячних лімітів бюджету.

Зовні це, як і раніше, набір «категорія → ліміт», але зберігається він
версіями в budget_history (див. app/limits.py): кожна зміна діє з поточного
місяця й не переписує минулі.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.limits import limits_for_month, record_limit
from app.models import User
from app.schemas import BudgetItem, BudgetRead
from app.timeutils import local_today

router = APIRouter(prefix="/budgets", tags=["budgets"])


async def _current(db: AsyncSession, user: User) -> list[BudgetRead]:
    limits = await limits_for_month(db, user.id)
    return [BudgetRead(category=category, monthly_limit=float(limit)) for category, limit in limits.items()]


@router.get(
    "/",
    response_model=list[BudgetRead],
    summary="Отримати всі ліміти",
)
async def list_budgets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BudgetRead]:
    """Повертає поточні ліміти, впорядковані за категорією."""
    return await _current(db, user)


@router.put(
    "/",
    response_model=list[BudgetRead],
    summary="Замінити набір лімітів",
)
async def replace_budgets(
    payload: list[BudgetItem],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BudgetRead]:
    """Повністю замінює набір лімітів переданим.

    Категорії, яких немає у списку, перестають відстежуватись — саме так
    працює діалог «Ліміти бюджету», де порожнє поле означає «без ліміту».
    """
    categories = [item.category for item in payload]
    duplicates = {c for c in categories if categories.count(c) > 1}
    if duplicates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Категорія повторюється: {', '.join(sorted(duplicates))}",
        )

    # Нова версія діє з поточного місяця; минулі рахуються за тими лімітами,
    # що діяли тоді. Діалог надсилає весь набір, тож пишемо лише те, що
    # справді змінилось.
    month = local_today().replace(day=1)
    current = await limits_for_month(db, user.id)
    wanted = {item.category: item.monthly_limit for item in payload}
    for category in sorted(current.keys() - wanted.keys()):
        await record_limit(db, user.id, category, None, month)
    for category, limit in wanted.items():
        if current.get(category) != limit:
            await record_limit(db, user.id, category, limit, month)
    await db.commit()

    return await _current(db, user)


@router.delete(
    "/{category}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Зняти ліміт з категорії",
)
async def delete_budget(
    category: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Знімає ліміт однієї категорії з поточного місяця."""
    if category not in await limits_for_month(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ліміт для категорії «{category}» не знайдено",
        )
    # Знятий ліміт лишається в минулих місяцях: з цього місяця його просто немає.
    await record_limit(db, user.id, category, None, local_today())
    await db.commit()
