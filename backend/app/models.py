"""ORM-моделі — таблиця expenses з підтримкою pgvector."""

import datetime
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Базовий клас для всіх ORM-моделей."""
    pass


class Expense(Base):
    """Транзакція витрати/доходу.

    Колонки:
        id          — UUID, первинний ключ
        amount      — сума (numeric(12,2))
        category    — категорія витрати (їжа, транспорт, …)
        spent_at    — дата/час транзакції
        note        — коментар користувача (довільний текст)
        embedding   — vector(384) для семантичного пошуку (all-MiniLM-L6-v2)
        created_at  — дата створення запису
    """

    __tablename__ = "expenses"
    __table_args__ = (
        Index(
            "ix_expenses_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="Сума транзакції (додатне — витрата, відʼємне — дохід)",
    )
    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Категорія: їжа, транспорт, розваги, …",
    )
    spent_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="Коли відбулась транзакція",
    )
    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Довільний коментар користувача",
    )
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(384),
        nullable=True,
        comment="Вектор ембедінгу для семантичного пошуку (384-dim)",
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        comment="Дата створення запису",
    )

    def __repr__(self) -> str:
        return (
            f"<Expense(id={self.id!s:.8}, amount={self.amount}, "
            f"category={self.category!r}, spent_at={self.spent_at})>"
        )
