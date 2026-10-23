"""Місцева доба користувача.

Межі періодів і групування мусять рахуватися в одному поясі: інакше список
транзакцій фільтрував би за UTC-добою, а статистика групувала за місцевою,
і та сама транзакція потрапляла б у різні дні.
"""

import datetime
from zoneinfo import ZoneInfo

from app.constants import MAX_YEAR, MIN_YEAR
from app.database import settings

TZ_NAME = settings.APP_TIMEZONE
TZ = ZoneInfo(TZ_NAME)


def local_midnight(day: datetime.date) -> datetime.datetime:
    """Початок місцевої доби як aware-datetime."""
    return datetime.datetime.combine(day, datetime.time.min, tzinfo=TZ)


def local_today() -> datetime.date:
    return datetime.datetime.now(TZ).date()


def in_date_range(day: datetime.date) -> bool:
    """Чи дата в межах, з якими коректно рахуються межі діб і місяців."""
    return MIN_YEAR <= day.year <= MAX_YEAR


def next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def prev_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _shift_months(day: datetime.date, months: int) -> datetime.date:
    """Те саме число на `months` місяців раніше/пізніше; 31-ше стає останнім днем."""
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    month += 1
    last = (datetime.date(*next_month(year, month), 1) - datetime.timedelta(days=1)).day
    return datetime.date(year, month, min(day.day, last))


def period_end(date_from: datetime.date, date_to: datetime.date, today: datetime.date) -> datetime.date:
    """Кінець періоду для середніх і порівняння: якщо період ще триває — сьогодні.

    Інакше «жовтень» 23 жовтня ділив би витрати на 31 день, а порівнювався
    б з повним вереснем.
    """
    if date_from <= today < date_to:
        return today
    return date_to


def previous_period(
    date_from: datetime.date, date_to: datetime.date, today: datetime.date
) -> tuple[datetime.date, datetime.date]:
    """Попередній період для порівняння, обидві межі включно.

    Цілі календарні місяці порівнюються з такою ж кількістю попередніх
    місяців: вересень — із серпнем 1–31, а не з «30 днями перед ним»
    (2–31 серпня). Незавершений поточний місяць — з тими самими числами
    попереднього: 1–23 жовтня проти 1–23 вересня, як на дашборді
    (`comparison_up_to_day`). Будь-який інший відрізок — з відрізком такої
    самої довжини безпосередньо перед ним.
    """
    end = period_end(date_from, date_to, today)
    before_start = date_from - datetime.timedelta(days=1)

    whole_months = date_from.day == 1 and (date_to + datetime.timedelta(days=1)).day == 1
    if whole_months:
        months = (date_to.year - date_from.year) * 12 + date_to.month - date_from.month + 1
        previous_from = _shift_months(date_from, -months)
        if end == date_to:
            return previous_from, before_start
        # Обрізаний сьогоднішнім днем: те саме число, але не далі за кінець
        # попереднього періоду (31 березня -> по 28 лютого включно).
        return previous_from, min(_shift_months(end, -months), before_start)

    days = (end - date_from).days + 1
    return before_start - datetime.timedelta(days=days - 1), before_start
