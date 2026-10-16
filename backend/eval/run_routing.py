"""Вимірює Routing Accuracy — частку запитів, для яких модель обрала
правильний шлях обробки.

Робиться один виклик моделі на запит (лише вибір інструмента, без формування
відповіді), тож прогін усього набору коштує ~30 запитів.

Запуск із теки backend:
    python -m eval.run_routing
    python -m eval.run_routing --csv eval/results.csv
"""

import argparse
import asyncio
import csv
import json
import sys
from collections import Counter

from app.llm import LLMUnavailable, chat_completion, is_configured
from app.tools import HANDLERS, system_prompt, tool_schemas
from eval.cases import CASES

# Якому шляху відповідає кожен інструмент.
TOOL_KIND = {
    "query_transactions": "sql",
    "semantic_search_notes": "rag",
    "hybrid_search_and_sum": "hybrid",
}

PACE_SECONDS = 2.5


async def route(question: str) -> tuple[str, dict]:
    """Повертає обраний шлях і аргументи. 'none' — коли інструмент не викликано."""
    message = await chat_completion(
        [
            {"role": "system", "content": system_prompt()},
            {"role": "user", "content": question},
        ],
        tools=tool_schemas(),
    )
    calls = message.get("tool_calls") or []
    if not calls:
        return "none", {}
    call = calls[0]["function"]
    try:
        arguments = json.loads(call["arguments"] or "{}")
    except json.JSONDecodeError:
        arguments = {}
    return TOOL_KIND.get(call["name"], call["name"]), arguments


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Куди зберегти результати таблицею")
    args = parser.parse_args()

    if not is_configured():
        print("Не задано GROQ_API_KEY — немає що оцінювати.")
        return 1

    rows = []
    for index, item in enumerate(CASES, 1):
        # Безкоштовний тариф Groq — 30 запитів/хв. Без паузи прогін набору
        # впирається в ліміт десь на половині.
        if index > 1:
            await asyncio.sleep(PACE_SECONDS)
        try:
            chosen, arguments = await route(item.question)
            error = ""
        except LLMUnavailable as exc:
            chosen, arguments, error = "—", {}, str(exc)

        correct = chosen in item.expected
        rows.append(
            {
                "№": index,
                "запит": item.question,
                "очікувано": "/".join(sorted(item.expected)),
                "обрано": chosen,
                "вірно": "так" if correct else "ні",
                "аргументи": json.dumps(arguments, ensure_ascii=False),
                "помилка": error,
            }
        )
        mark = " OK " if correct else "ХИБА"
        print(f"{mark} [{index:2}] {chosen:7} (очік. {'/'.join(sorted(item.expected)):12}) {item.question}")

    total = len(rows)
    correct = sum(r["вірно"] == "так" for r in rows)
    print()
    print(f"Routing Accuracy: {correct}/{total} = {correct / total:.1%}")

    # Точність окремо за очікуваним шляхом — видно, який сценарій слабший.
    print()
    by_kind: Counter[str] = Counter()
    hits: Counter[str] = Counter()
    for item, row in zip(CASES, rows):
        key = "/".join(sorted(item.expected))
        by_kind[key] += 1
        hits[key] += row["вірно"] == "так"
    for key in sorted(by_kind):
        print(f"  {key:16} {hits[key]}/{by_kind[key]}")

    wrong = [r for r in rows if r["вірно"] == "ні"]
    if wrong:
        print()
        print("Помилки маршрутизації:")
        for r in wrong:
            print(f"  «{r['запит']}» -> {r['обрано']}, очікувано {r['очікувано']}")

    if args.csv:
        with open(args.csv, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]), delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nТаблицю збережено: {args.csv}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
