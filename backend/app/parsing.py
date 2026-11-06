"""Розбір опису витрати своїми словами в чернетку транзакції.

«вчора таксі 230» -> сума, категорія, дата, нотатка, теги — без збереження:
людина бачить заповнену форму й підтверджує сама.

Два способи:
  parse_llm   — мовна модель через окремий інструмент із суворою схемою;
  parse_rules — простий детермінований розбір: число, ключові слова
                категорій, «вчора/позавчора». Працює без ключа LLM і є
                запасним, якщо модель недоступна чи відповіла не за схемою.

Як і в чаті, модель лише розкладає текст на поля. Знак суми ставить код за
категорією, а дату рахує код від «сьогодні»: модель повертає лише, скільки
днів тому це було. Так «стипендія» не стане витратою через знак, який
модель поставила навмання.
"""

import datetime
import json
import re
from dataclasses import dataclass, field
from typing import Literal

from app.constants import CATEGORIES, INCOME_CATEGORY, MOOD_TAGS
from app.llm import LLMUnavailable, chat_completion
from app.timeutils import TZ, local_today

# Скільки днів тому найдалі може бути «вчора» з тексту. Більше — майже
# напевно помилка моделі, а не реальна давня витрата.
MAX_DAYS_AGO = 60

# Порядок важливий: перший збіг виграє. Доходи й підписки — першими, бо
# «переказ від батьків на продукти» — це дохід, а не їжа; розваги — перед
# кафе, бо «антикафе» містить «кафе».
CATEGORY_STEMS: list[tuple[str, tuple[str, ...]]] = [
    (INCOME_CATEGORY, ("стипенд", "зарплат", "зп", "фріланс", "підробіт", "премі", "переказ від", "кешбек", "борг повер", "повернула борг", "повернув борг")),
    ("підписки", ("netflix", "spotify", "youtube", "icloud", "google one", "duolingo", "chatgpt", "підписк")),
    ("комунальні", ("гуртож", "комунал", "комуналк", "світло", "електроенерг", "інтернет", "мобільн", "оренд", "квартплат", "осбб")),
    ("здоров'я", ("аптек", "ліки", "лікар", "стоматолог", "вітамін", "аналіз", "спортзал", "басейн", "терапевт")),
    ("транспорт", ("таксі", "bolt", "uber", "uklon", "метро", "трамва", "тролейбус", "автобус", "маршрутк", "проїзн", "потяг", "бензин", "пальне")),
    ("розваги", ("кіно", "концерт", "театр", "боулінг", "караоке", "квест", "музей", "виставк", "настолк", "антикафе", "гра ", "ігр")),
    ("кафе", ("кава", "кави", "кав'ярн", "кавʼярн", "лате", "капучино", "американо", "еспресо", "раф", "чай", "піц", "суші", "рол", "бургер", "шаурм", "обід", "вечер", "сніданок", "ресторан", "кафе", "круасан", "морозив", "глово", "доставк")),
    ("їжа", ("продукт", "атб", "сільпо", "рукавичк", "novus", "супермаркет", "хліб", "молок", "сир", "яйц", "овоч", "фрукт", "шоколад", "чипс", "ринок", "гречк", "макарон")),
    ("покупки", ("одяг", "кросівк", "взутт", "куртк", "джинс", "футболк", "сукн", "светр", "косметик", "помад", "подарун", "навушник", "книг", "зошит", "канцеляр", "чохол")),
]

# Підказки для тегів настрою. Ширші за TAG_STEMS у пошуку: тут людина описує
# себе («не виспалась»), і помилка коштує лише зайвого чіпа, який видно у
# формі й можна зняти.
TAG_HINTS: dict[str, tuple[str, ...]] = {
    "стрес": ("стрес", "нерв", "перенерв", "тривог"),
    "втома": ("втом", "не виспал", "невиспан", "виснаж", "без сил", "не було сил", "сил не"),
    "свято": ("свят", "день народж", "ювіле", "новий рік"),
    "імпульс": ("імпульс", "спонтан", "не втрималась", "не втримався"),
    "з друзями": ("друз", "подруг", "однокурсн", "одногруп", "з групою"),
    "необхідне": ("необхідн", "треба було"),
}

_DAY_WORDS = (("позавчора", 2), ("вчора", 1), ("сьогодні", 0))
_SPACE = "[   ]"
_AMOUNT = re.compile(rf"(?<![\w.,])(\d{{1,3}}(?:{_SPACE}\d{{3}})+|\d+)(?:[.,](\d{{1,2}}))?(?![\w])")
_CURRENCY = re.compile(r"(?:₴|\bгрн\.?|\bгривень\b|\bгривні\b|\bгривня\b|\buah\b)", re.I)


@dataclass
class Draft:
    amount: float | None
    category: str
    spent_at: datetime.datetime
    note: str | None
    tags: list[str] = field(default_factory=list)
    source: Literal["llm", "rules"] = "rules"


def _has(text: str, stem: str) -> bool:
    """Чи є в тексті слово, що починається з основи (або фраза з кількох слів)."""
    if " " in stem.strip() or not stem.isalpha():
        return stem in text
    return re.search(rf"(?<![\w']){re.escape(stem)}", text) is not None


def _signed(amount: float | None, category: str) -> float | None:
    if amount is None:
        return None
    return abs(amount) if category == INCOME_CATEGORY else -abs(amount)


def _moment(days_ago: int) -> datetime.datetime:
    """Той самий час доби, але `days_ago` днів тому — як у формі на телефоні."""
    now = datetime.datetime.now(TZ)
    day = local_today() - datetime.timedelta(days=days_ago)
    return datetime.datetime.combine(day, now.time().replace(microsecond=0), tzinfo=TZ)


def guess_category(text: str) -> str:
    lowered = text.lower()
    for category, stems in CATEGORY_STEMS:
        if any(_has(lowered, stem) for stem in stems):
            return category
    return "інше"


def guess_tags(text: str) -> list[str]:
    lowered = text.lower()
    return [tag for tag, hints in TAG_HINTS.items() if any(_has(lowered, hint) for hint in hints)]


def parse_rules(text: str) -> Draft:
    """Детермінований розбір: число, ключові слова, «вчора/позавчора»."""
    lowered = text.lower()
    days_ago = next((days for word, days in _DAY_WORDS if word in lowered), 0)

    amount = None
    rest = text
    match = _AMOUNT.search(text)
    if match:
        whole = re.sub(_SPACE, "", match.group(1))
        amount = float(f"{whole}.{match.group(2)}" if match.group(2) else whole)
        rest = text[: match.start()] + " " + text[match.end() :]

    # Нотатка — те, що лишилось після суми, валюти й дня: самий зміст.
    for word, _ in _DAY_WORDS:
        rest = re.sub(rf"\b{word}\b", " ", rest, flags=re.I)
    rest = _CURRENCY.sub(" ", rest)
    rest = re.sub(r"\s+([,.!?])", r"\1", re.sub(r"\s+", " ", rest)).strip(" ,.;:-—")
    note = rest[:1].upper() + rest[1:] if rest else None

    category = guess_category(text)
    return Draft(
        amount=_signed(amount, category),
        category=category,
        spent_at=_moment(days_ago),
        note=note,
        tags=guess_tags(text),
        source="rules",
    )


DRAFT_TOOL = {
    "type": "function",
    "function": {
        "name": "draft_transaction",
        "description": "Поля транзакції, описаної користувачем своїми словами.",
        "parameters": {
            "type": "object",
            "properties": {
                "amount": {
                    "type": ["number", "null"],
                    "description": "Сума з тексту як є, без знака; null, якщо суми в тексті немає",
                },
                "category": {"type": "string", "enum": list(CATEGORIES)},
                "days_ago": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": MAX_DAYS_AGO,
                    "description": "Скільки днів тому: сьогодні — 0, вчора — 1, позавчора — 2",
                },
                "note": {
                    "type": ["string", "null"],
                    "description": "Короткий опис українською словами користувача, без суми й дати",
                },
                "tags": {"type": "array", "items": {"type": "string", "enum": list(MOOD_TAGS)}},
            },
            "required": ["amount", "category", "days_ago", "note", "tags"],
            "additionalProperties": False,
        },
    },
}


def _prompt() -> str:
    return (
        "Ти розбираєш опис витрати чи доходу в поля форми застосунку Крона. "
        f"Сьогодні {local_today().isoformat()}.\n"
        "Суму бери лише ту, що є в тексті, і не рахуй нічого сам. Якщо суми немає — amount null.\n"
        f"«{INCOME_CATEGORY}» — лише для грошей, які людина отримала: стипендія, зарплата, переказ.\n"
        "Теги настрою став лише тоді, коли текст прямо про це каже."
    )


async def parse_llm(text: str) -> Draft:
    """Розбір мовною моделлю. Кидає ValueError, якщо відповідь не за схемою."""
    message = await chat_completion(
        [{"role": "system", "content": _prompt()}, {"role": "user", "content": text}],
        tools=[DRAFT_TOOL],
        tool_choice={"type": "function", "function": {"name": "draft_transaction"}},
    )
    calls = message.get("tool_calls") or []
    if not calls:
        raise ValueError("модель не повернула чернетку")
    try:
        args = json.loads(calls[0]["function"]["arguments"] or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("аргументи не JSON") from exc

    amount = args.get("amount")
    if amount is not None and (isinstance(amount, bool) or not isinstance(amount, int | float) or amount == 0):
        raise ValueError(f"сума не число: {amount!r}")
    category = args.get("category")
    if category not in CATEGORIES:
        raise ValueError(f"невідома категорія: {category!r}")
    days_ago = args.get("days_ago", 0)
    if isinstance(days_ago, bool) or not isinstance(days_ago, int) or not 0 <= days_ago <= MAX_DAYS_AGO:
        raise ValueError(f"дата поза межами: {days_ago!r}")
    note = args.get("note")
    note = note.strip()[:1000] or None if isinstance(note, str) else None
    # Невідомий тег не причина відкидати всю чернетку — просто без нього.
    tags = list(dict.fromkeys(t for t in args.get("tags") or [] if t in MOOD_TAGS))

    return Draft(
        amount=_signed(float(amount) if amount is not None else None, category),
        category=category,
        spent_at=_moment(days_ago),
        note=note,
        tags=tags,
        source="llm",
    )


async def parse(text: str, use_llm: bool) -> Draft:
    """Чернетка з тексту: моделлю, якщо можна, інакше правилами."""
    if use_llm:
        try:
            return await parse_llm(text)
        except (LLMUnavailable, ValueError, KeyError, TypeError):
            # Чернетку людина все одно перевіряє у формі, тож простий розбір
            # кращий за помилку на екрані.
            pass
    return parse_rules(text)
