"""Агрегована статистика — рахується SQL-запитами, а не на клієнті.

Усе групування йде за місцевою добою (`APP_TIMEZONE`), бо користувач думає
про «вчора» у своєму часовому поясі, а не в UTC.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db, settings
from app.models import Budget, Transaction, User
from app.schemas import MonthlyStats, MonthStats

router = APIRouter(prefix="/stats", tags=["stats"])

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"

TZ_NAME = settings.APP_TIMEZONE
TZ = ZoneInfo(TZ_NAME)

# Сума доходів і сума витрат (витрати беремо за модулем).
INCOME_SUM = func.coalesce(func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)), 0)
EXPENSE_SUM = func.coalesce(func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0)), 0)

# spent_at у місцевому часі, щоб добу/місяць рахувати правильно.
LOCAL_TS = func.timezone(TZ_NAME, Transaction.spent_at)
LOCAL_DATE = cast(LOCAL_TS, Date)
LOCAL_MONTH = func.to_char(LOCAL_TS, "YYYY-MM")


def _local_midnight(day: date) -> datetime:
    """Початок місцевої доби як aware-datetime."""
    return datetime.combine(day, time.min, tzinfo=TZ)


def _month_start(year: int, month: int) -> datetime:
    return _local_midnight(date(year, month, 1))


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _prev_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _percent_change(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return (current - previous) / abs(previous) * 100


def _round_percent(part: float, whole: float) -> int:
    if whole <= 0:
        return 0
    # +0.5 замість round(), щоб округлення збігалося з Math.round у JS.
    return int(part / whole * 100 + 0.5)


async def _totals(db: AsyncSession, user_id, start: datetime, end: datetime) -> tuple[float, float, int]:
    """Доходи, витрати й кількість транзакцій у межах [start, end)."""
    row = (
        await db.execute(
            select(INCOME_SUM, EXPENSE_SUM, func.count(Transaction.id)).where(
                Transaction.user_id == user_id, Transaction.spent_at >= start, Transaction.spent_at < end
            )
        )
    ).one()
    return float(row[0]), float(row[1]), int(row[2])


@router.get("/month", response_model=MonthStats, summary="Статистика за місяць")
async def month_stats(
    month: str = Query(..., pattern=MONTH_PATTERN, description="Місяць у форматі YYYY-MM", examples=["2026-10"]),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonthStats:
    """Усе, що потрібно дашборду: підсумки, категорії, динаміка, бюджети."""
    year, mon = int(month[:4]), int(month[5:7])
    start = _month_start(year, mon)
    end = _month_start(*_next_month(year, mon))
    days_in_month = (end.date() - start.date()).days

    today_local = datetime.now(TZ).date()
    is_current_month = (today_local.year, today_local.month) == (year, mon)
    # У незавершеному місяці середнє рахуємо на дні, що минули.
    days_elapsed = today_local.day if is_current_month else days_in_month

    total_income, total_expenses, transaction_count = await _totals(db, user.id, start, end)

    # Попередній період: для поточного місяця — тільки 1–N число, щоб
    # порівняння було з таким самим відрізком, а не з повним місяцем.
    prev_year, prev_mon = _prev_month(year, mon)
    prev_start = _month_start(prev_year, prev_mon)
    prev_end = start
    comparison_up_to_day = None
    if is_current_month:
        capped = _local_midnight(prev_start.date() + timedelta(days=today_local.day))
        if capped < prev_end:
            prev_end = capped
            comparison_up_to_day = today_local.day
    prev_income, prev_expenses, _ = await _totals(db, user.id, prev_start, prev_end)

    by_category = (
        await db.execute(
            select(Transaction.category, func.sum(-Transaction.amount))
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end, Transaction.amount < 0)
            .group_by(Transaction.category)
            .order_by(func.sum(-Transaction.amount).desc())
        )
    ).all()
    spent_by_category = {row[0]: float(row[1]) for row in by_category}

    by_day = (
        await db.execute(
            select(LOCAL_DATE.label("day"), INCOME_SUM, EXPENSE_SUM)
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end)
            .group_by(LOCAL_DATE)
        )
    ).all()
    day_map = {row[0]: (float(row[1]), float(row[2])) for row in by_day}

    by_weekday = (
        await db.execute(
            select(func.extract("isodow", LOCAL_TS).label("dow"), func.sum(-Transaction.amount))
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end, Transaction.amount < 0)
            .group_by(func.extract("isodow", LOCAL_TS))
        )
    ).all()
    weekday_map = {int(row[0]): float(row[1]) for row in by_weekday}

    budget_rows = (await db.execute(select(Budget).where(Budget.user_id == user.id).order_by(Budget.category))).scalars().all()
    all_time_balance = float(
        (await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.user_id == user.id))).scalar_one()
    )

    return MonthStats(
        month=month,
        total_income=total_income,
        total_expenses=total_expenses,
        balance=total_income - total_expenses,
        transaction_count=transaction_count,
        avg_daily_expense=total_expenses / days_elapsed if days_elapsed else 0.0,
        savings_rate=(total_income - total_expenses) / total_income if total_income > 0 else 0.0,
        total_balance=all_time_balance,
        category_breakdown=[
            {
                "category": category,
                "amount": amount,
                "percent": _round_percent(amount, total_expenses),
            }
            for category, amount in spent_by_category.items()
        ],
        cashflow=[
            {
                "date": day,
                "income": day_map.get(day, (0.0, 0.0))[0],
                "expense": day_map.get(day, (0.0, 0.0))[1],
            }
            # Усі дні місяця, зокрема порожні — графік має бути безперервним.
            for day in (start.date() + timedelta(days=i) for i in range(days_in_month))
        ],
        budgets=[
            {
                "category": budget.category,
                "limit": float(budget.monthly_limit),
                "spent": spent_by_category.get(budget.category, 0.0),
            }
            for budget in budget_rows
        ],
        weekday=[{"weekday": dow, "amount": weekday_map.get(dow, 0.0)} for dow in range(1, 8)],
        comparison={
            "income_change": _percent_change(total_income, prev_income),
            "expense_change": _percent_change(total_expenses, prev_expenses),
            "balance_change": _percent_change(
                total_income - total_expenses, prev_income - prev_expenses
            ),
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
    year, mon = int(until[:4]), int(until[5:7])
    end = _month_start(*_next_month(year, mon))

    window = [(year, mon)]
    for _ in range(months - 1):
        window.append(_prev_month(*window[-1]))
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
    summary_map = {row[0]: (float(row[1]), float(row[2])) for row in summary_rows}

    category_rows = (
        await db.execute(
            select(LOCAL_MONTH.label("month"), Transaction.category, func.sum(-Transaction.amount))
            .where(Transaction.user_id == user.id, Transaction.spent_at >= start, Transaction.spent_at < end, Transaction.amount < 0)
            .group_by(LOCAL_MONTH, Transaction.category)
        )
    ).all()
    category_map: dict[str, dict[str, float]] = {}
    for month_key, category, amount in category_rows:
        category_map.setdefault(month_key, {})[category] = float(amount)

    return MonthlyStats(
        summaries=[
            {
                "month": key,
                "income": summary_map.get(key, (0.0, 0.0))[0],
                "expense": summary_map.get(key, (0.0, 0.0))[1],
                "net": summary_map.get(key, (0.0, 0.0))[0] - summary_map.get(key, (0.0, 0.0))[1],
            }
            for key in keys
        ],
        categories=[{"month": key, "amounts": category_map.get(key, {})} for key in keys],
    )
