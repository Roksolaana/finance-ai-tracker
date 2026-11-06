"""Перевірка достовірності: кожне число відповіді має бути в даних або в питанні."""

import pytest

from eval.faithfulness import check, extract_numbers

SEP = {"expenses": 1234.0, "income": 2000.0, "count": 12}


def unsupported(answer, payloads=(SEP,), question=""):
    return check(answer, list(payloads), question).unsupported


@pytest.mark.parametrize(
    "text, values",
    [
        pytest.param("Ви витратили 1 234 ₴", [1234], id="пробіл між тисячами"),
        pytest.param("Ви витратили 1 234 ₴", [1234], id="нерозривний пробіл"),
        pytest.param("Ви витратили 1 234,50 ₴", [1234.5], id="вузький пробіл і кома"),
        pytest.param("частка 12.5% і ще 4 %", [12.5, 4], id="відсотки"),
        pytest.param("мінус −1 404 ₴", [1404], id="знак не важливий"),
        pytest.param("близько 16 тис. ₴", [16000], id="тисячі словом"),
    ],
)
def test_numbers_are_extracted_with_formatting(text, values):
    assert [n.value for n in extract_numbers(text)] == values


@pytest.mark.parametrize(
    "text",
    [
        pytest.param("Дані за 2026-10-16.", id="ISO-дата"),
        pytest.param("Станом на 16.10.2026 нічого немає.", id="дата з крапками"),
        pytest.param("З 1 по 16 жовтня покупок не було.", id="діапазон днів"),
        pytest.param("1–16 жовтня і 3 вересня", id="тире і день місяця"),
        pytest.param("У 2026 році й у вересні 2026", id="рік"),
        pytest.param("Оплата о 21:30", id="час"),
        pytest.param("1. Кава\n2) Таксі", id="нумерація рядків"),
        # Так моделі пишуть дати насправді: нерозривний дефіс U+2011.
        pytest.param("за 2026‑08‑01 – 2026‑08‑31", id="ISO з нерозривним дефісом"),
        pytest.param("Період: 12 жовтня — 18 жовтня 2026", id="день, місяць і рік"),
        pytest.param("проїзний (01.10) і автобус (08.10)", id="день і місяць без року"),
    ],
)
def test_dates_and_numbering_are_ignored(text):
    assert extract_numbers(text) == []


def test_answer_with_only_tool_numbers_is_faithful():
    assert unsupported("У вересні ви витратили 1 234 ₴ за 12 операцій, а отримали 2 000 ₴.") == []


def test_invented_number_is_reported():
    assert unsupported("Разом 5 000 ₴, це на 4% більше, ніж у серпні.") == ["5 000", "4%"]


def test_rounding_to_whole_hryvnias_is_allowed():
    payload = {"average_per_day": 41.13, "total": 1234.56}
    assert unsupported("Середнє 41 ₴ на день, разом 1 235 ₴.", [payload]) == []
    # Відкинуті копійки — теж не вигадка: 36.67 -> «36 ₴».
    assert unsupported("Середньо 36 ₴ за день.", [{"average_per_day": 36.67}]) == []
    # Але не «округлення» до зручного числа.
    assert unsupported("Разом приблизно 1 240 ₴.", [payload]) == ["1 240"]


def test_nested_values_and_numbers_inside_strings():
    payload = {
        "budgets": [{"category": "кафе", "limit": 3000, "spent": 3280, "over_by": 280, "used_percent": 109}],
        "transactions": [{"amount": 199.0, "note": "iCloud 50 ГБ", "date": "2026-10-05"}],
    }
    answer = "Кафе: 3 280 ₴ при ліміті 3 000 ₴, перевищення 280 ₴ (109%). Ще iCloud 50 ГБ за 199 ₴."
    assert unsupported(answer, [payload]) == []


def test_numbers_from_question_are_allowed():
    question = "Покажи всі витрати понад 1000 гривень за три місяці"
    answer = "Витрат понад 1 000 ₴ за останні 3 місяці не знайдено."
    assert unsupported(answer, [{"transactions": []}], question) == []


def test_question_number_words_are_allowed():
    answer = "Понад 1 000 ₴ витрат не було."
    assert unsupported(answer, [{"transactions": []}], "Чи були витрати понад тисячу гривень?") == []


def test_count_of_listed_records_is_allowed():
    payload = {"found": 3, "transactions": [{"amount": 85.0}, {"amount": 90.0}, {"amount": 120.0}]}
    assert unsupported("Знайшла 3 записи: 85 ₴, 90 ₴ і 120 ₴.", [payload]) == []
    # Довжина переліку доступна й без поля з кількістю.
    assert unsupported("Знайшла 3 записи.", [{"transactions": [{"a": 1}, {"a": 2}, {"a": 3}]}]) == []


def test_share_as_percent():
    assert unsupported("Ви відклали 25% доходу.", [{"savings_rate": 0.25}]) == []


def test_several_tool_results_are_combined():
    first, second = {"expenses": 500.0}, {"expenses": 700.0}
    assert unsupported("Вересень 500 ₴, жовтень 700 ₴.", [first, second]) == []


def test_answer_without_numbers_is_faithful():
    report = check("Нічого не знайшла.", [], "")
    assert report.ok and report.numbers == []
