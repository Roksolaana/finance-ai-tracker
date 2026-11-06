"""Регулярні платежі: підписки, гуртожиток, проїзний.

Серія — це витрати з однаковою нотаткою (або, якщо нотатки немає, з
однаковою категорією), сумою в межах ±10% і проміжком приблизно місяць,
щонайменше три рази. Усе рахує код за правилами нижче, без мовної моделі:
асистент лише переказує готовий перелік.
"""

import datetime
import re
import statistics
import uuid
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Transaction
from app.timeutils import TZ, _shift_months, local_today

MIN_REPEATS = 3
AMOUNT_TOLERANCE = Decimal("0.10")
# «Приблизно місяць»: медіанний проміжок 25–35 днів, а кожен окремий —
# 20–40. Ширше — і щотижневі покупки склеювались би з місячними; вужче — і
# списання, що зсунулось на вихідні, розривало б серію.
MEDIAN_INTERVAL = (25, 35)
ANY_INTERVAL = (20, 40)
# Скільки історії дивимось і коли серія вважається закінченою: якщо
# останнє списання давніше за три проміжки, підписку, найімовірніше,
# скасовано.
LOOKBACK_DAYS = 365
STALE_AFTER_INTERVALS = 3


@dataclass
class Series:
    name: str
    category: str
    average_amount: float
    count: int
    interval_days: int
    last_date: datetime.date
    next_date: datetime.date

    def describe(self) -> dict:
        return {
            "name": self.name,
            "category": self.category,
            "average_amount": self.average_amount,
            "count": self.count,
            "interval_days": self.interval_days,
            "last_date": self.last_date.isoformat(),
            "next_date": self.next_date.isoformat(),
        }


def _key(transaction: Transaction) -> str:
    """Чим вважати «ту саму» витрату: нотатку без регістру й зайвих пробілів."""
    if transaction.note and transaction.note.strip():
        return "note:" + re.sub(r"\s+", " ", transaction.note.strip(" .,!").casefold())
    return "category:" + transaction.category


def _monthly(dates: list[datetime.date]) -> int | None:
    """Медіанний проміжок у днях, якщо серія справді щомісячна; інакше None."""
    gaps = [(later - earlier).days for earlier, later in zip(dates, dates[1:])]
    if not all(ANY_INTERVAL[0] <= gap <= ANY_INTERVAL[1] for gap in gaps):
        return None
    # median_low, а не median: ціле число без правил округлення половинок.
    median = statistics.median_low(gaps)
    return median if MEDIAN_INTERVAL[0] <= median <= MEDIAN_INTERVAL[1] else None


async def find_series(db: AsyncSession, user_id: uuid.UUID) -> list[Series]:
    """Регулярні витрати користувача, найближче наступне списання — першим."""
    today = local_today()
    since = datetime.datetime.combine(today - datetime.timedelta(days=LOOKBACK_DAYS), datetime.time.min, tzinfo=TZ)
    rows = (
        await db.execute(
            select(Transaction)
            .where(Transaction.user_id == user_id, Transaction.amount < 0, Transaction.spent_at >= since)
            .order_by(Transaction.spent_at)
        )
    ).scalars().all()

    groups: dict[str, list[Transaction]] = {}
    for row in rows:
        groups.setdefault(_key(row), []).append(row)

    found = []
    for key, items in groups.items():
        # Усередині групи суми можуть належати різним тарифам: «Spotify» за
        # 100 і за 200 — це дві різні підписки, а не одна з «середнім» 133.
        clusters: list[list[Transaction]] = []
        for item in items:
            amount = abs(Decimal(item.amount))
            for cluster in clusters:
                average = sum(abs(Decimal(t.amount)) for t in cluster) / len(cluster)
                if abs(amount - average) <= average * AMOUNT_TOLERANCE:
                    cluster.append(item)
                    break
            else:
                clusters.append([item])

        for cluster in clusters:
            if len(cluster) < MIN_REPEATS:
                continue
            dates = [t.spent_at.astimezone(TZ).date() for t in cluster]
            interval = _monthly(dates)
            if interval is None or (today - dates[-1]).days > STALE_AFTER_INTERVALS * interval:
                continue
            total = sum(abs(Decimal(t.amount)) for t in cluster)
            average = (total / len(cluster)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            last = cluster[-1]
            found.append(
                Series(
                    name=last.note.strip() if key.startswith("note:") else last.category,
                    category=last.category,
                    average_amount=float(average),
                    count=len(cluster),
                    interval_days=interval,
                    last_date=dates[-1],
                    # Те саме число наступного місяця: підписку знають як
                    # «списання 5-го», а не «через 31 день».
                    next_date=_shift_months(dates[-1], 1),
                )
            )
    return sorted(found, key=lambda s: (s.next_date, s.name))
