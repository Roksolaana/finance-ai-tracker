"""Підрахунок метрик оцінки: шлях, аргументи, підсумкова таблиця.

Окремо від скриптів прогону, щоб правила підрахунку можна було перевірити
тестами без виклику моделі.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

# Якому шляху відповідає кожен інструмент. Ліміти — окремий шлях, а не
# «sql»: query_transactions лімітів не бачить, тож відповідь ним на питання
# про бюджет неправильна, хоча формально це теж SQL.
TOOL_PATH = {
    "query_transactions": "sql",
    "semantic_search_notes": "rag",
    "hybrid_search_and_sum": "hybrid",
    "check_budgets": "budgets",
}
PATHS = ("sql", "budgets", "rag", "hybrid", "none")


def path_of(tool_name: str | None) -> str:
    """Шлях за назвою інструмента; 'none' — модель не викликала нічого."""
    if not tool_name:
        return "none"
    return TOOL_PATH.get(tool_name, tool_name)


def _arg_ok(want: Any, got: Any) -> bool:
    if want is None:
        # Очікується, що аргумент не задано: null і відсутність рівноцінні.
        return got in (None, "")
    if isinstance(want, tuple):
        return any(_arg_ok(option, got) for option in want)
    if isinstance(want, float | int) and isinstance(got, float | int):
        return float(want) == float(got)
    return want == got


def args_mismatch(expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
    """Назви аргументів, що не збіглися з очікуваними (частковий збіг).

    Перевіряються лише ключі з `expected`; решту модель може задавати як
    завгодно. Кортеж — кілька рівноцінних варіантів: «цей місяць» 16 жовтня
    можна задати і як 1–16, і як 1–31 жовтня, сума буде та сама.
    """
    return [key for key, want in expected.items() if not _arg_ok(want, actual.get(key))]


@dataclass
class Summary:
    total: int
    soft: int
    strict: int
    args_total: int
    args_ok: int
    answers_total: int = 0
    faithful: int = 0
    seconds: float = 0.0

    @staticmethod
    def share(part: int, whole: int) -> float | None:
        return part / whole if whole else None


def summarise(rows: Iterable[dict[str, Any]]) -> Summary:
    """Зводить рядки прогону (див. run_routing) в метрики.

    Рядки з помилкою виклику моделі рахуються як невірні: інакше збій
    провайдера непомітно підвищував би точність.
    """
    rows = list(rows)
    args_rows = [r for r in rows if r.get("args_ok") is not None]
    answered = [r for r in rows if r.get("faithful") is not None]
    timed = [r["seconds"] for r in rows if r.get("seconds") is not None]
    return Summary(
        total=len(rows),
        soft=sum(bool(r["soft_ok"]) for r in rows),
        strict=sum(bool(r["strict_ok"]) for r in rows),
        args_total=len(args_rows),
        args_ok=sum(bool(r["args_ok"]) for r in args_rows),
        answers_total=len(answered),
        faithful=sum(bool(r["faithful"]) for r in answered),
        seconds=sum(timed) / len(timed) if timed else 0.0,
    )


def retrieval_scores(retrieved: set[str], relevant: set[str]) -> tuple[float, float, float]:
    """Precision, recall і F1 одного запиту за множинами різних нотаток.

    Запит без релевантних нотаток вірний лише тоді, коли пошук нічого не
    повернув. Якщо ж релевантні є, а не знайдено нічого, точність формально
    не визначена — рахуємо її нулем, щоб надто високий поріг, який «мовчить»
    на все, не виглядав точним.
    """
    if not relevant:
        return (1.0, 1.0, 1.0) if not retrieved else (0.0, 1.0, 0.0)
    hits = len(retrieved & relevant)
    precision = hits / len(retrieved) if retrieved else 0.0
    recall = hits / len(relevant)
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1
