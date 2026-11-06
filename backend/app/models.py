"""ORM-моделі — таблиці users, transactions (з підтримкою pgvector), budget_history і chat_messages."""

import datetime
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    # Має збігатися з клеймом `ver` у токені: так можна відкликати всі
    # видані токени разом, хоча JWT сам по собі не відкликається.
    token_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="Версія токенів; збільшується, щоб відкликати всі видані раніше",
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
        embedding   — vector(384) для семантичного пошуку (paraphrase-multilingual-MiniLM-L12-v2)
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
    # Обовʼязковий з міграції 0007: «нічиї» записи забирав перший акаунт,
    # і на свіжій установці він отримував чужі дані.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
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


class BudgetHistory(Base):
    """Версія ліміту категорії, що діє з певного місяця.

    Єдине місце, де лежать ліміти. Без історії зміна ліміту в жовтні
    переписувала і вересень: «чи вклалась я у вересні» відповідалось за новим
    лімітом. Для місяця M діє остання версія з valid_from <= M, поточний
    ліміт — остання версія взагалі; NULL у monthly_limit — ліміт знято.
    """

    __tablename__ = "budget_history"
    __table_args__ = (
        CheckConstraint("extract(day from valid_from) = 1", name="budget_history_valid_from_first_day"),
    )

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
    valid_from: Mapped[datetime.date] = mapped_column(
        Date,
        primary_key=True,
        comment="Перше число місяця, з якого діє ця версія ліміту",
    )
    monthly_limit: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Ліміт витрат на місяць; NULL — з цього місяця ліміт знято",
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="Коли версію записано або востаннє змінено",
    )

    def __repr__(self) -> str:
        return f"<BudgetHistory(category={self.category!r}, valid_from={self.valid_from}, limit={self.monthly_limit})>"


class ChatMessage(Base):
    """Повідомлення розмови з асистентом.

    Історія живе на сервері, щоб не губитися при повторному відкритті чату
    й бути однаковою на всіх пристроях користувача.
    """

    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="Власник розмови",
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False, comment="user або assistant")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="Текст повідомлення")
    # Який інструмент дав відповідь і які записи знайдено (лише для асистента).
    tool_call: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Інструмент і знайдені записи (лише у відповідей асистента)",
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return f"<ChatMessage(role={self.role!r}, content={self.content[:30]!r})>"
