"""Агрегована статистика — рахується SQL-запитами, а не на клієнті.

Усе групування йде за місцевою добою (`APP_TIMEZONE`), бо користувач думає
про «вчора» у своєму часовому поясі, а не в UTC.
"""

from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.constants import MAX_YEAR, MIN_YEAR
from app.database import get_db
from app.models import Budget, Transaction, User
from app.schemas import CENT, MonthlyStats, MonthStats
from app.timeutils import (
    TZ_NAME,
    local_midnight,
    local_today,
    next_month,
    period_end,
    prev_month,
    previous_period,
)

router = APIRouter(prefix="/stats", tags=["stats"])

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"

# Сума доходів і сума витрат (витрати беремо за модулем).
INCOME_SUM = func.coalesce(func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)), 0)
EXPENSE_SUM = func.coalesce(func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0)

# spent_at у місцевому часі, щоб добу/місяць рахувати правильно.
LOCAL_TS = func.timezone(TZ_NAME, Transaction.spent_at)
LOCAL_DATE = cast(LOCAL_TS, Date)
LOCAL_MONTH = func.to_char(LOCAL_TS, "YYYY-MM")

ZERO = Decimal(0)


def _month_start(year: int, month: int) -> datetime:
    return local_midnight(date(year, month, 1))


def _parse_month(value: str) -> tuple[int, int]:
    """Рік і місяць з YYYY-MM; формат уже перевірив pattern у Query.

    Рік обмежуємо окремо: на 0000 чи 9999 межі місяця не будуються
    (date(0, …) не існує, а 9999-12 не має наступного місяця), і запит
    падав з 500 замість зрозумілої 422.
    """
    year, month = int(value[:4]), int(value[5:7])
    if not MIN_YEAR <= year <= MAX_YEAR:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Місяць має бути в межах {MIN_YEAR}–{MAX_YEAR} років",
        )
    return year, month


def _money(value: Decimal) -> float:
    """Decimal з бази -> float для відповіді, округлений до копійки один раз.

    Віднімання й ділення робимо ще в Decimal: у float 0.3 - 0.2 дає
    0.09999999999999998, і такі хвости потрапляли в баланс на дашборді.
    """
    return float(Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP))


def _percent_change(current: Decimal, previous: Decimal) -> float | None:
    if previous == 0:
        return None
    return float((current - previous) / abs(previous) * 100)


def _round_percent(part: Decimal, whole: Decimal) -> int:
    if whole <= 0:
        return 0
    # +0.5 замість round(), щоб округлення збігалося з Math.round у JS.
    return int(part / whole * 100 + Decimal("0.5"))


async def _totals(db: AsyncSession, user_id, start: datetime, end: datetime) -> tuple[Decimal, Decimal, int]:
    """Доходи, витрати й кількість транзакцій у межах [start, end)."""
    row = (
        await db.execute(
            select(INCOME_SUM, EXPENSE_SUM, func.count(Transaction.id)).where(
                Transaction.user_id == user_id, Transaction.spent_at >= start, Transaction.spent_at < end
            )
        )
    ).one()
    return Decimal(row[0]), Decimal(row[1]), int(row[2])


@router.get("/month", response_model=MonthStats, summary="Статистика за місяць")
async def month_stats(
    month: str = Query(..., pattern=MONTH_PATTERN, description="Місяць у форматі YYYY-MM", examples=["2026-10"]),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonthStats:
    """Усе, що потрібно дашборду: підсумки, категорії, динаміка, бюджети."""
    year, mon = _parse_month(month)
    first_day = date(year, mon, 1)
    last_day = date(*next_month(year, mon), 1) - timedelta(days=1)
    start = local_midnight(first_day)
    end = local_midnight(last_day + timedelta(days=1))
    days_in_month = last_day.day

    today_local = local_today()
    # У незавершеному місяці середнє рахуємо на дні, що минули.
    days_elapsed = (period_end(first_day, last_day, today_local) - first_day).days + 1

    total_income, total_expenses, transaction_count = await _totals(db, user.id, start, end)

    # Попередній період: для поточного місяця — тільки 1–N число, щоб
    # порівняння було з таким самим відрізком, а не з повним місяцем.
    # За тим самим правилом порівнює й асистент (tools.query_transactions).
    prev_from, prev_to = previous_period(first_day, last_day, today_local)
    prev_income, prev_expenses, _ = await _totals(
        db, user.id, local_midnight(prev_from), local_midnight(prev_to + timedelta(days=1))
    )
    truncated = prev_to < first_day - timedelta(days=1)
    comparison_up_to_day = today_local.day if truncated else None

    by_category = (
        await db.execute(
            select(Transaction.category, func.sum(-Transaction.amount))
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end, Transaction.amount < 0)
            .group_by(Transaction.category)
            .order_by(func.sum(-Transaction.amount).desc())
        )
    ).all()
    spent_by_category = {row[0]: Decimal(row[1]) for row in by_category}

    by_day = (
        await db.execute(
            select(LOCAL_DATE.label("day"), INCOME_SUM, EXPENSE_SUM)
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end)
            .group_by(LOCAL_DATE)
        )
    ).all()
    day_map = {row[0]: (Decimal(row[1]), Decimal(row[2])) for row in by_day}

    by_weekday = (
        await db.execute(
            select(func.extract("isodow", LOCAL_TS).label("dow"), func.sum(-Transaction.amount))
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end, Transaction.amount < 0)
            .group_by(func.extract("isodow", LOCAL_TS))
        )
    ).all()
    weekday_map = {int(row[0]): Decimal(row[1]) for row in by_weekday}

    budget_rows = (await db.execute(select(Budget).where(Budget.user_id == user.id).order_by(Budget.category))).scalars().all()
    all_time_balance = Decimal(
        (await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.user_id == user.id))).scalar_one()
    )
    balance = total_income - total_expenses

    return MonthStats(
        month=month,
        total_income=_money(total_income),
        total_expenses=_money(total_expenses),
        balance=_money(balance),
        transaction_count=transaction_count,
        avg_daily_expense=_money(total_expenses / days_elapsed) if days_elapsed else 0.0,
        savings_rate=float(balance / total_income) if total_income > 0 else 0.0,
        total_balance=_money(all_time_balance),
        category_breakdown=[
            {
                "category": category,
                "amount": _money(amount),
                "percent": _round_percent(amount, total_expenses),
            }
            for category, amount in spent_by_category.items()
        ],
        cashflow=[
            {
                "date": day,
                "income": _money(day_map.get(day, (ZERO, ZERO))[0]),
                "expense": _money(day_map.get(day, (ZERO, ZERO))[1]),
            }
            # Усі дні місяця, зокрема порожні — графік має бути безперервним.
            for day in (first_day + timedelta(days=i) for i in range(days_in_month))
        ],
        budgets=[
            {
                "category": budget.category,
                "limit": _money(budget.monthly_limit),
                "spent": _money(spent_by_category.get(budget.category, ZERO)),
            }
            for budget in budget_rows
        ],
        weekday=[{"weekday": dow, "amount": _money(weekday_map.get(dow, ZERO))} for dow in range(1, 8)],
        comparison={
            "income_change": _percent_change(total_income, prev_income),
            "expense_change": _percent_change(total_expenses, prev_expenses),
            "balance_change": _percent_change(balance, prev_income - prev_expenses),
        },
        comparison_up_to_day=comparison_up_to_day,
    )


@router.get("/monthly", response_model=MonthlyStats, summary="Підсумки за кілька місяців")
async def monthly_stats(
    until: str = Query(..., pattern=MONTH_PATTERN, description="Останній місяць вікна (YYYY-MM)"),
    months: int = Query(6, ge=1, le=36, description="Скільки місяців включно з `until`"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonthlyStats:
    """Дані для графіків аналітики: доходи/витрати та категорії по місяцях."""
    year, mon = _parse_month(until)
    end = _month_start(*next_month(year, mon))

    window = [(year, mon)]
    for _ in range(months - 1):
        window.append(prev_month(*window[-1]))
    window.reverse()
    keys = [f"{y:04d}-{m:02d}" for y, m in window]
    start = _month_start(*window[0])

    summary_rows = (
        await db.execute(
            select(LOCAL_MONTH.label("month"), INCOME_SUM, EXPENSE_SUM)
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end)
            .group_by(LOCAL_MONTH)
        )
    ).all()
    summary_map = {row[0]: (Decimal(row[1]), Decimal(row[2])) for row in summary_rows}

    category_rows = (
        await db.execute(
            select(LOCAL_MONTH.label("month"), Transaction.category, func.sum(-Transaction.amount))
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end, Transaction.amount < 0)
            .group_by(LOCAL_MONTH, Transaction.category)
        )
    ).all()
    category_map: dict[str, dict[str, float]] = {}
    for month_key, category, amount in category_rows:
        category_map.setdefault(month_key, {})[category] = _money(amount)

    summaries = []
    for key in keys:
        income, expense = summary_map.get(key, (ZERO, ZERO))
        summaries.append({"month": key, "income": _money(income), "expense": _money(expense), "net": _money(income - expense)})

    return MonthlyStats(
        summaries=summaries,
        categories=[{"month": key, "amounts": category_map.get(key, {})} for key in keys],
    )
