"""Pydantic-схеми для валідації вхідних/вихідних даних."""

import datetime
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCreate(BaseModel):
    """Схема для створення транзакції (POST-запит)."""

    amount: Decimal = Field(
        ...,
        max_digits=12,
        decimal_places=2,
        description="Сума транзакції",
        examples=[149.99],
    )
    category: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Категорія витрати",
        examples=["їжа"],
    )
    spent_at: datetime.datetime | None = Field(
        default=None,
        description="Дата/час транзакції. Якщо не вказано — поточний час.",
    )
    note: str | None = Field(
        default=None,
        max_length=1000,
        description="Коментар до транзакції",
        examples=["Обід у кафе з друзями"],
    )


class ExpenseRead(BaseModel):
    """Схема для відповіді — одна транзакція."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: Decimal
    category: str
    spent_at: datetime.datetime
    note: str | None
    created_at: datetime.datetime


class ExpenseList(BaseModel):
    """Обгортка для списку транзакцій з пагінацією."""

    items: list[ExpenseRead]
    total: int
    page: int
    per_page: int
