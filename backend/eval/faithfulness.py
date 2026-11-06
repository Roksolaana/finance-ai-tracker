"""Достовірність відповіді: чи не вигадала модель жодного числа.

Принцип застосунку — числа рахує база, модель лише пояснює. Промпт про це
просить, але перевірити, чи модель слухається, можна лише на самих
відповідях: кожне число з тексту має знайтися в JSON, який повернули
інструменти, або в питанні користувача.

Що вважається тим самим числом:
  - округлення до гривні чи відкинуті копійки: 1234.56 у даних і
    «1 235 ₴» або «1 234 ₴» у тексті;
  - частка у відсотках: 0.25 у даних і «25%» у тексті;
  - «16 тис.» — округлення до тисяч;
  - кількість елементів переліку: модель природно каже «знайшла 3 записи».
Що не перевіряється:
  - дати, дні місяця, роки, час і нумерація рядків — це не обчислення;
  - числа словами («три записи») — їх модель пише рідко, а розбір відмінків
    дав би більше хибних тривог, ніж користі.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

_SPACE = "[   ]"

# Моделі пишуть дати не лише з ASCII-дефісом: gpt-oss ставить нерозривний
# U+2011, і «2026‑08‑01» розпадалося на «вигадані» 08 і 01.
_DASH = "[-‐‑‒]"

_MONTHS_GENITIVE = "січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня"
_MONTH_WORD = r"(?:січ|лют|берез|квіт|трав|черв|лип|серп|верес|жовт|листопад|груд)\w*"

# Те, що схоже на число, але є датою чи службовою позначкою. Вирізається до
# пошуку чисел.
_IGNORED = [
    re.compile(rf"\b\d{{4}}{_DASH}\d{{2}}(?:{_DASH}\d{{2}})?\b"),  # 2026-10-16, 2026-10
    re.compile(r"\b\d{1,2}\.\d{1,2}\.\d{2,4}\b"),  # 16.10.2026
    # «24 08 2026» — так gpt-oss записує дати в переліках; без цього «08 202»
    # читалося як сума з розділювачем тисяч.
    re.compile(rf"\b\d{{1,2}}{_SPACE}\d{{2}}{_SPACE}20\d{{2}}\b"),
    re.compile(r"\b\d{1,2}:\d{2}\b"),  # 21:30
    # «(08.10)» — день і місяць без року. Лише з нулем попереду й у межах
    # календаря, щоб не зачепити десяткові на кшталт «12.5».
    re.compile(r"\b(?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\b(?![.,]?\d)(?!\s*(?:₴|грн|%))"),
    # «16 жовтня», «1–16 жовтня», «з 1 по 16 жовтня», «18 жовтня 2026»
    re.compile(
        rf"\b(?:\d{{1,2}}\s*(?:[–—-]|по|до)\s*)?\d{{1,2}}(?:-?го)?\s+(?:{_MONTHS_GENITIVE})\b(?:\s+20\d{{2}}\b)?",
        re.I,
    ),
    re.compile(rf"\b{_MONTH_WORD}\s+20\d{{2}}\b", re.I),  # «вересні 2026»
    re.compile(r"\b20\d{2}\s*(?:р\.|р\b|рік\w*|році|року|роки)", re.I),  # «2026 році»
    re.compile(r"\b(?:у|в|за)\s+20\d{2}\b", re.I),  # «у 2026»
    re.compile(r"^\s*\d{1,2}[.)]\s", re.M),  # нумерація рядків «1.», «2)»
]

_NUMBER = re.compile(
    rf"""
    (?<![\w.,])
    (?P<int>\d{{1,3}}(?:{_SPACE}\d{{3}})+|\d+)
    (?:[.,](?P<frac>\d+))?
    (?P<thousands>{_SPACE}*(?:тис\.?|тисяч\w*))?
    (?P<percent>{_SPACE}*%)?
    """,
    re.X | re.I,
)

# Числа словами в питанні: «понад тисячу», «за три місяці».
_WORDS = {
    r"одн\w*|один": 1,
    r"дв\w+": 2,
    r"три|трьох": 3,
    r"чотир\w+": 4,
    r"п['ʼ’]?ят\w*": 5,
    r"шіст\w*": 6,
    r"сім|семи": 7,
    r"вісім\w*": 8,
    r"дев['ʼ’]?ят\w*": 9,
    r"десят\w*": 10,
    r"сто": 100,
    r"тисяч\w*": 1000,
}


@dataclass(frozen=True)
class Number:
    value: float
    raw: str
    percent: bool = False
    # «16 тис.» — свідоме округлення до тисяч.
    approximate: bool = False


@dataclass
class Report:
    numbers: list[str] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.unsupported


def extract_numbers(text: str) -> list[Number]:
    """Числа з тексту відповіді без дат, часу й нумерації."""
    for pattern in _IGNORED:
        text = pattern.sub(" ", text)
    numbers = []
    for match in _NUMBER.finditer(text):
        whole = re.sub(_SPACE, "", match["int"])
        value = float(f"{whole}.{match['frac']}" if match["frac"] else whole)
        raw = match["int"] + (f",{match['frac']}" if match["frac"] else "")
        if match["thousands"]:
            numbers.append(Number(value * 1000, raw + " тис.", approximate=True))
        elif match["percent"]:
            numbers.append(Number(value, raw + "%", percent=True))
        else:
            numbers.append(Number(value, raw))
    return numbers


def _values(payload: Any) -> Iterable[float]:
    """Усі числа з результату інструмента, разом із довжинами переліків."""
    if isinstance(payload, bool):
        return
    if isinstance(payload, int | float):
        yield abs(float(payload))
    elif isinstance(payload, str):
        # Нотатки й дати теж бувають джерелом: «iCloud 50 ГБ».
        for raw in re.findall(r"\d+(?:[.,]\d+)?", payload):
            yield float(raw.replace(",", "."))
    elif isinstance(payload, dict):
        for value in payload.values():
            yield from _values(value)
    elif isinstance(payload, list | tuple):
        yield float(len(payload))
        for value in payload:
            yield from _values(value)


def _question_values(question: str) -> Iterable[float]:
    yield from _values(question)
    for pattern, value in _WORDS.items():
        if re.search(rf"\b(?:{pattern})\b", question, re.I):
            yield float(value)


def _supported(number: Number, allowed: set[float]) -> bool:
    value = abs(number.value)
    if number.approximate:
        return any(abs(value - v) <= 500 for v in allowed)
    if number.percent and any(abs(value / 100 - v) <= 0.005 for v in allowed):
        return True
    # Менше гривні — це округлення чи відкинуті копійки (36.67 -> «36 ₴»),
    # яких і просить промпт, а не нове число.
    return any(abs(value - v) < 1 for v in allowed)


def check(answer: str, payloads: list[Any], question: str) -> Report:
    """Звіряє числа відповіді з результатами інструментів і питанням."""
    allowed = {v for payload in payloads for v in _values(payload)} | set(_question_values(question))
    numbers = extract_numbers(answer)
    return Report(
        numbers=[n.raw for n in numbers],
        unsupported=[n.raw for n in numbers if not _supported(n, allowed)],
    )
