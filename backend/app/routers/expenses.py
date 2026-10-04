"""CRUD-ендпоінти для транзакцій (expenses)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Expense
from app.schemas import ExpenseCreate, ExpenseList, ExpenseRead

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.post(
    "/",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
    summary="Додати транзакцію",
)
async def create_expense(
    payload: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
) -> Expense:
    """Створює нову транзакцію витрати.

    Якщо `spent_at` не вказано — підставляє поточний UTC-час.
    Поле `embedding` поки залишається NULL — буде заповнено
    на Тижні 3 (RAG-частина).
    """
    expense = Expense(
        amount=payload.amount,
        category=payload.category,
        spent_at=payload.spent_at or datetime.now(timezone.utc),
        note=payload.note,
        # embedding=None — заповниться пізніше
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.get(
    "/",
    response_model=ExpenseList,
    summary="Список транзакцій з пагінацією",
)
async def list_expenses(
    page: int = Query(1, ge=1, description="Номер сторінки"),
    per_page: int = Query(20, ge=1, le=100, description="Кількість на сторінці"),
    category: str | None = Query(None, description="Фільтр за категорією"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Повертає список транзакцій з пагінацією та опціональним фільтром."""
    base_query = select(Expense)
    count_query = select(func.count(Expense.id))

    if category:
        base_query = base_query.where(Expense.category == category)
        count_query = count_query.where(Expense.category == category)

    # Загальна кількість
    total = (await db.execute(count_query)).scalar_one()

    # Вибірка з пагінацією
    offset = (page - 1) * per_page
    result = await db.execute(
        base_query.order_by(Expense.spent_at.desc()).offset(offset).limit(per_page)
    )
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get(
    "/{expense_id}",
    response_model=ExpenseRead,
    summary="Отримати транзакцію за ID",
)
async def get_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Expense:
    """Повертає одну транзакцію за UUID."""
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Транзакцію з id={expense_id} не знайдено",
        )
    return expense


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Видалити транзакцію",
)
async def delete_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Видаляє транзакцію за UUID."""
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Транзакцію з id={expense_id} не знайдено",
        )
    await db.delete(expense)
    await db.commit()
