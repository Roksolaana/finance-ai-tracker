"""ORM-моделі — таблиці transactions (з підтримкою pgvector) та budgets."""

import datetime
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Базовий клас для всіх ORM-моделей."""
    pass


class User(Base):
    """Користувач застосунку.

    Пароль зберігається лише як bcrypt-хеш; початкового пароля система не знає.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
        comment="Логін користувача, зберігається у нижньому регістрі",
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="bcrypt-хеш пароля",
    )
    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Імʼя, яке показується в інтерфейсі",
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id!s:.8}, email={self.email!r})>"


class Transaction(Base):
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

    __tablename__ = "transactions"
    __table_args__ = (
        Index(
            "ix_transactions_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        # Під фільтрацію за періодом і категорією (список транзакцій, статистика).
        Index("ix_transactions_spent_at_category", "spent_at", "category"),
        # Основний шлях доступу: дані одного користувача за період.
        Index("ix_transactions_user_spent_at", "user_id", "spent_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    # Nullable через записи, створені до введення користувачів: їх забирає
    # собі перший зареєстрований акаунт (див. міграцію 0003 і routers/auth.py).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        comment="Власник транзакції",
    )
    amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="Сума транзакції (відʼємне — витрата, додатне — дохід)",
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
            f"<Transaction(id={self.id!s:.8}, amount={self.amount}, "
            f"category={self.category!r}, spent_at={self.spent_at})>"
        )


class Budget(Base):
    """Місячний ліміт витрат для категорії.

    Один рядок = одна категорія, тому category є первинним ключем.
    Ліміт не привʼязаний до конкретного місяця: він діє на кожен місяць,
    поки користувач його не змінить.
    """

    __tablename__ = "budgets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        comment="Власник ліміту",
    )
    category: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        comment="Витратна категорія, на яку встановлено ліміт",
    )
    monthly_limit: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="Ліміт витрат на місяць",
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="Коли ліміт останній раз змінювали",
    )

    def __repr__(self) -> str:
        return f"<Budget(category={self.category!r}, monthly_limit={self.monthly_limit})>"
