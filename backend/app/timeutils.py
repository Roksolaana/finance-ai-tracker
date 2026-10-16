"""Місцева доба користувача.

Межі періодів і групування мусять рахуватися в одному поясі: інакше список
транзакцій фільтрував би за UTC-добою, а статистика групувала за місцевою,
і та сама транзакція потрапляла б у різні дні.
"""

import datetime
from zoneinfo import ZoneInfo

from app.database import settings

TZ_NAME = settings.APP_TIMEZONE
TZ = ZoneInfo(TZ_NAME)


def local_midnight(day: datetime.date) -> datetime.datetime:
    """Початок місцевої доби як aware-datetime."""
    return datetime.datetime.combine(day, datetime.time.min, tzinfo=TZ)


def local_today() -> datetime.date:
    return datetime.datetime.now(TZ).date()
