"""CRUD-ендпоінти для транзакцій."""

import uuid
from datetime import date, datetime, timedelta, timezone, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Transaction, User
from app.schemas import TransactionCreate, TransactionList, TransactionRead
from app.timeutils import local_midnight

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post(
    "/",
    response_model=TransactionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Додати транзакцію",
)
async def create_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transaction:
    """Створює нову транзакцію витрати.

    Якщо `spent_at` не вказано — підставляє поточний UTC-час.
    Поле `embedding` поки залишається NULL — буде заповнено
    на Тижні 3 (RAG-частина).
    """
    transaction = Transaction(
        user_id=user.id,
        amount=payload.amount,
        category=payload.category,
        spent_at=payload.spent_at or datetime.now(timezone.utc),
        note=payload.note,
        # embedding=None — заповниться пізніше
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.post(
    "/bulk",
    response_model=list[TransactionRead],
    status_code=status.HTTP_201_CREATED,
    summary="Додати багато транзакцій одразу",
)
async def create_transactions_bulk(
    payload: list[TransactionCreate],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Transaction]:
    """Масове створення (використовується для заповнення демо-даними)."""
    transactions = [
        Transaction(
            user_id=user.id,
            amount=item.amount,
            category=item.category,
            spent_at=item.spent_at or datetime.now(timezone.utc),
            note=item.note,
        )
        for item in payload
    ]
    db.add_all(transactions)
    await db.commit()
    return transactions


@router.delete(
    "/",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Видалити всі транзакції",
)
async def delete_all_transactions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Видаляє всі транзакції поточного користувача."""
    await db.execute(delete(Transaction).where(Transaction.user_id == user.id))
    await db.commit()


def _escape_like(value: str) -> str:
    """Екранує символи LIKE, щоб % та _ у тексті шукались буквально."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get(
    "/",
    response_model=TransactionList,
    summary="Список транзакцій з пагінацією та фільтрами",
)
async def list_transactions(
    page: int = Query(1, ge=1, description="Номер сторінки"),
    per_page: int = Query(20, ge=1, le=1000, description="Кількість на сторінці"),
    category: str | None = Query(None, description="Фільтр за категорією"),
    date_from: date | None = Query(None, description="З цієї дати включно (місцевий час)"),
    date_to: date | None = Query(None, description="До цієї дати включно (місцевий час)"),
    search: str | None = Query(None, min_length=1, max_length=200, description="Підрядок у нотатці"),
    tx_type: Literal["income", "expense"] | None = Query(
        None, alias="type", description="Лише доходи або лише витрати"
    ),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Повертає список транзакцій, відсортований від найновіших.

    Межі дат рахуються за місцевою добою (`APP_TIMEZONE`) — так само, як
    групує статистика.
    """
    # Власник — завжди перша умова: чужі записи не мають бути видимі.
    conditions = [Transaction.user_id == user.id]
    if category:
        conditions.append(Transaction.category == category)
    if date_from:
        conditions.append(Transaction.spent_at >= local_midnight(date_from))
    if date_to:
        conditions.append(Transaction.spent_at < local_midnight(date_to + timedelta(days=1)))
    if search:
        conditions.append(Transaction.note.ilike(f"%{_escape_like(search)}%", escape="\\"))
    if tx_type == "income":
        conditions.append(Transaction.amount > 0)
    elif tx_type == "expense":
        conditions.append(Transaction.amount < 0)

    total = (await db.execute(select(func.count(Transaction.id)).where(*conditions))).scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Transaction)
        .where(*conditions)
        .order_by(Transaction.spent_at.desc())
        .offset(offset)
        .limit(per_page)
    )

    return {
        "items": list(result.scalars().all()),
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get(
    "/{transaction_id}",
    response_model=TransactionRead,
    summary="Отримати транзакцію за ID",
)
async def get_transaction(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transaction:
    """Повертає одну транзакцію за UUID."""
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user.id))
    transaction = result.scalar_one_or_none()
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Транзакцію з id={transaction_id} не знайдено",
        )
    return transaction


@router.put(
    "/{transaction_id}",
    response_model=TransactionRead,
    summary="Оновити транзакцію",
)
async def update_transaction(
    transaction_id: uuid.UUID,
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Transaction:
    """Повністю замінює поля транзакції за UUID."""
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user.id))
    transaction = result.scalar_one_or_none()
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Транзакцію з id={transaction_id} не знайдено",
        )
    transaction.amount = payload.amount
    transaction.category = payload.category
    transaction.note = payload.note
    if payload.spent_at is not None:
        transaction.spent_at = payload.spent_at
    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.delete(
    "/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Видалити транзакцію",
)
async def delete_transaction(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Видаляє транзакцію за UUID."""
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user.id))
    transaction = result.scalar_one_or_none()
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Транзакцію з id={transaction_id} не знайдено",
        )
    await db.delete(transaction)
    await db.commit()
