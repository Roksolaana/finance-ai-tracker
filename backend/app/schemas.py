"""Pydantic-схеми для валідації вхідних/вихідних даних."""

import datetime
import uuid
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.constants import CATEGORIES, EXPENSE_CATEGORIES

# Допуск, щоб трохи спішний годинник клієнта не ламав запис «щойно».
CLOCK_SKEW = datetime.timedelta(minutes=5)

MAX_AMOUNT = Decimal("9999999999.99")
CENT = Decimal("0.01")


class RegisterRequest(BaseModel):
    """Реєстрація нового акаунта."""

    email: EmailStr = Field(..., description="Логін", examples=["roksolana@example.com"])
    password: str = Field(..., min_length=8, max_length=128, description="Мінімум 8 символів")
    display_name: str = Field(..., min_length=1, max_length=100, examples=["Роксолана"])

    # EmailStr зводить до нижнього регістру лише домен, тому локальну частину
    # нормалізуємо самі — інакше Olha@ та olha@ стали б різними акаунтами.
    _lower_email = field_validator("email")(lambda cls, v: v.lower())

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Імʼя не може бути порожнім")
        return name


class LoginRequest(BaseModel):
    """Вхід в акаунт."""

    email: EmailStr
    password: str = Field(..., max_length=128)

    _lower_email = field_validator("email")(lambda cls, v: v.lower())


class UserRead(BaseModel):
    """Публічні дані акаунта — без хеша пароля."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    created_at: datetime.datetime


class AuthResponse(BaseModel):
    """Токен і профіль після входу чи реєстрації."""

    access_token: str
    token_type: str = "bearer"
    user: UserRead


class TransactionCreate(BaseModel):
    """Схема для створення та оновлення транзакції."""

    amount: Decimal = Field(
        ...,
        description="Сума: від'ємна — витрата, додатна — дохід",
        examples=[-149.99],
    )
    category: str = Field(
        ...,
        description=f"Категорія. Доступні: {', '.join(CATEGORIES)}",
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

    @field_validator("amount")
    @classmethod
    def check_amount(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("Сума не може бути нульовою")
        if abs(value) > MAX_AMOUNT:
            raise ValueError("Сума занадто велика")
        # Гроші зберігаємо з точністю до копійки; лишнє округлюємо, а не відхиляємо.
        return value.quantize(CENT, rounding=ROUND_HALF_UP)

    @field_validator("category")
    @classmethod
    def check_category(cls, value: str) -> str:
        if value not in CATEGORIES:
            raise ValueError(f"Невідома категорія «{value}». Доступні: {', '.join(CATEGORIES)}")
        return value

    @field_validator("spent_at")
    @classmethod
    def check_spent_at(cls, value: datetime.datetime | None) -> datetime.datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=datetime.timezone.utc)
        if value > datetime.datetime.now(datetime.timezone.utc) + CLOCK_SKEW:
            raise ValueError("Дата транзакції не може бути в майбутньому")
        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class TransactionRead(BaseModel):
    """Схема для відповіді — одна транзакція."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: float
    # Навмисно `str`, а не список категорій: записи, створені до введення
    # валідації, можуть мати будь-яку категорію і не повинні ламати читання.
    category: str
    spent_at: datetime.datetime
    note: str | None
    created_at: datetime.datetime


class TransactionList(BaseModel):
    """Обгортка для списку транзакцій з пагінацією."""

    items: list[TransactionRead]
    total: int
    page: int
    per_page: int


class CategoryBreakdownEntry(BaseModel):
    """Скільки витрачено в категорії та яка це частка всіх витрат."""

    category: str
    amount: float
    percent: int


class CashflowPoint(BaseModel):
    """Доходи й витрати за одну добу (місцевий час)."""

    date: datetime.date
    income: float
    expense: float


class BudgetProgress(BaseModel):
    """Ліміт категорії та фактична витрата за місяць."""

    category: str
    limit: float
    spent: float


class WeekdayPoint(BaseModel):
    """Витрати за днем тижня: 1 — понеділок, 7 — неділя (ISO)."""

    weekday: int
    amount: float


class PeriodComparison(BaseModel):
    """Зміна у відсотках проти попереднього періоду. None — ділити не на що."""

    income_change: float | None
    expense_change: float | None
    balance_change: float | None


class MonthStats(BaseModel):
    """Повна статистика за один місяць."""

    month: str
    total_income: float
    total_expenses: float
    balance: float
    transaction_count: int
    avg_daily_expense: float
    savings_rate: float
    # Баланс по всіх транзакціях, а не лише за цей місяць.
    total_balance: float
    category_breakdown: list[CategoryBreakdownEntry]
    cashflow: list[CashflowPoint]
    budgets: list[BudgetProgress]
    weekday: list[WeekdayPoint]
    comparison: PeriodComparison
    # Для поточного місяця порівняння йде з 1–N числом минулого, а не з усім
    # місяцем; тут N, щоб інтерфейс міг це підписати.
    comparison_up_to_day: int | None


class MonthlySummary(BaseModel):
    """Підсумок одного місяця для графіка за півроку."""

    month: str
    income: float
    expense: float
    net: float


class CategoryMonthRow(BaseModel):
    """Витрати за категоріями в межах одного місяця."""

    month: str
    amounts: dict[str, float]


class MonthlyStats(BaseModel):
    """Дані для аналітики за кілька місяців."""

    summaries: list[MonthlySummary]
    categories: list[CategoryMonthRow]


class BudgetItem(BaseModel):
    """Місячний ліміт для однієї категорії."""

    model_config = ConfigDict(from_attributes=True)

    category: str = Field(
        ...,
        description=f"Витратна категорія. Доступні: {', '.join(EXPENSE_CATEGORIES)}",
        examples=["їжа"],
    )
    monthly_limit: float = Field(..., gt=0, description="Ліміт на місяць", examples=[6000])

    @field_validator("category")
    @classmethod
    def check_category(cls, value: str) -> str:
        if value not in EXPENSE_CATEGORIES:
            raise ValueError(
                f"Ліміт можна ставити лише на витратну категорію. Доступні: {', '.join(EXPENSE_CATEGORIES)}"
            )
        return value
