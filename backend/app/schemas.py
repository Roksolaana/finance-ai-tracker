"""Pydantic-схеми для валідації вхідних/вихідних даних."""

import datetime
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.constants import CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORY, MIN_YEAR

# Допуск, щоб трохи спішний годинник клієнта не ламав запис «щойно».
CLOCK_SKEW = datetime.timedelta(minutes=5)

# Найбільше значення, яке вміщає Numeric(12, 2) у transactions і budgets.
MAX_AMOUNT = Decimal("9999999999.99")
CENT = Decimal("0.01")

# Раніша дата — майже напевно помилка вводу (0001 замість 2001), а не справжня
# транзакція.
MIN_SPENT_AT = datetime.datetime(MIN_YEAR, 1, 1, tzinfo=datetime.timezone.utc)


def to_cents(value: Decimal) -> Decimal:
    """Округлює суму до копійки, перевіривши, що вона вміщається в колонку.

    Межу перевіряємо до округлення: quantize на числі на кшталт 1e30 сам
    падає з InvalidOperation, а все, що не більше MAX_AMOUNT, після
    округлення теж лишається в межах.
    """
    if not value.is_finite() or abs(value) > MAX_AMOUNT:
        raise ValueError("Сума занадто велика")
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


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
        # Гроші зберігаємо з точністю до копійки; лишнє округлюємо, а не відхиляємо.
        value = to_cents(value)
        # Нуль перевіряємо вже після округлення: 0.004 стає 0.00, і такий запис
        # не був би ні доходом, ні витратою — оминав би перевірку знака нижче.
        if value == 0:
            raise ValueError("Сума не може бути нульовою")
        return value

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
        if value < MIN_SPENT_AT:
            raise ValueError(f"Дата транзакції не може бути раніше {MIN_YEAR} року")
        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def check_sign_matches_category(self) -> "TransactionCreate":
        """Знак суми мусить відповідати категорії.

        Статистика рахує додатні суми як дохід, а розподіл по категоріях
        будує лише з відʼємних. Без цієї перевірки запис «+500, їжа» потрапляв
        би в доходи, але не в жодну категорію витрат.
        """
        is_income_category = self.category == INCOME_CATEGORY
        if self.amount > 0 and not is_income_category:
            raise ValueError(f"Додатна сума можлива лише в категорії «{INCOME_CATEGORY}»")
        if self.amount < 0 and is_income_category:
            raise ValueError(f"Категорія «{INCOME_CATEGORY}» потребує додатної суми")
        return self


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


class ChatRequest(BaseModel):
    """Запит до AI-асистента.

    Попередній контекст сервер бере зі збереженої розмови, а не з тіла запиту:
    інакше клієнт міг би підкласти моделі вигадану репліку «асистента».
    Старі клієнти ще надсилають поле `history` — воно просто ігнорується
    (зайві поля Pydantic за замовчуванням відкидає, `extra="forbid"` тут не ставити).
    """

    message: str = Field(..., min_length=1, max_length=1000, examples=["Скільки я витратила на каву цього місяця?"])


class ToolCallInfo(BaseModel):
    """Який інструмент обрала модель — для показу в інтерфейсі та для оцінки."""

    name: str
    # sql — детерміновані числа, rag — пошук за змістом, hybrid — одне й друге
    kind: Literal["sql", "rag", "hybrid"]
    duration_ms: int
    matched_transaction_ids: list[str] = Field(default_factory=list)


class ChatMessageOut(BaseModel):
    """Відповідь асистента."""

    id: str
    role: Literal["assistant"]
    content: str
    timestamp: datetime.datetime
    tool_call: ToolCallInfo | None = None


class ChatResponse(BaseModel):
    message: ChatMessageOut
    # Знайдені транзакції, щоб інтерфейс показав, на чому побудована відповідь.
    transactions: list[TransactionRead] = Field(default_factory=list)


class ChatHistoryMessage(BaseModel):
    """Збережене повідомлення розмови — і користувача, і асистента."""

    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime.datetime
    tool_call: ToolCallInfo | None = None


class ChatHistory(BaseModel):
    messages: list[ChatHistoryMessage]
    # Знайдені записи за id відповіді асистента — ті самі, що показувались
    # одразу після відповіді. Видалені з того часу транзакції випадають.
    transactions: dict[str, list[TransactionRead]] = Field(default_factory=dict)


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
    """Місячний ліміт для однієї категорії (вхідні дані)."""

    category: str = Field(
        ...,
        description=f"Витратна категорія. Доступні: {', '.join(EXPENSE_CATEGORIES)}",
        examples=["їжа"],
    )
    monthly_limit: Decimal = Field(..., description="Ліміт на місяць, більше нуля", examples=[6000])

    @field_validator("monthly_limit")
    @classmethod
    def check_limit(cls, value: Decimal) -> Decimal:
        # Як і з сумою транзакції: спершу округлення, потім перевірка на нуль.
        # Інакше 0.001 зберігалось як 0.00, і такий ліміт потім не проходив
        # схему відповіді — GET /budgets/ падав з 500 на кожному запиті.
        value = to_cents(value)
        if value <= 0:
            raise ValueError("Ліміт має бути більшим за нуль")
        return value

    @field_validator("category")
    @classmethod
    def check_category(cls, value: str) -> str:
        if value not in EXPENSE_CATEGORIES:
            raise ValueError(
                f"Ліміт можна ставити лише на витратну категорію. Доступні: {', '.join(EXPENSE_CATEGORIES)}"
            )
        return value


class BudgetRead(BaseModel):
    """Ліміт у відповіді.

    Окремо від BudgetItem, щоб перевірки вводу не застосовувались до вже
    збережених рядків: невдалий рядок у базі мав би показатись, а не ламати
    весь список.
    """

    model_config = ConfigDict(from_attributes=True)

    category: str
    monthly_limit: float
