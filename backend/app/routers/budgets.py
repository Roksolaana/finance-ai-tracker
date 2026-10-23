"""Ендпоінти для місячних лімітів бюджету."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Budget, User
from app.schemas import BudgetItem, BudgetRead

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get(
    "/",
    response_model=list[BudgetRead],
    summary="Отримати всі ліміти",
)
async def list_budgets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Budget]:
    """Повертає ліміти, впорядковані за категорією."""
    result = await db.execute(select(Budget).where(Budget.user_id == user.id).order_by(Budget.category))
    return list(result.scalars().all())


@router.put(
    "/",
    response_model=list[BudgetRead],
    summary="Замінити набір лімітів",
)
async def replace_budgets(
    payload: list[BudgetItem],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Budget]:
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

    await db.execute(delete(Budget).where(Budget.user_id == user.id))
    db.add_all([Budget(user_id=user.id, category=item.category, monthly_limit=item.monthly_limit) for item in payload])
    await db.commit()

    result = await db.execute(select(Budget).where(Budget.user_id == user.id).order_by(Budget.category))
    return list(result.scalars().all())


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
    """Видаляє ліміт однієї категорії."""
    result = await db.execute(select(Budget).where(Budget.user_id == user.id, Budget.category == category))
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ліміт для категорії «{category}» не знайдено",
        )
    await db.delete(budget)
    await db.commit()
