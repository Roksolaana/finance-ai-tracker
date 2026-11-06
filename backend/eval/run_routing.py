"""Оцінка асистента на розміченому наборі eval/cases.py.

Метрики:
  мʼяка точність    — обраний шлях серед прийнятних (expected);
  строга точність   — обрано саме найкращий шлях (primary);
  аргументи вірні   — primary-інструмент отримав очікувані аргументи
                      (лише для кейсів з expected_args);
  faithfulness      — частка відповідей без жодного числа, якого немає ні в
                      даних інструментів, ні в питанні (з --answers);
  середній час      — на один запит, разом з виконанням інструментів.

«Сьогодні» фіксується на cases.TODAY і для промпту, і для інструментів,
тож очікувані дати не залежать від дня прогону.

Без --answers робиться один виклик моделі на запит (лише вибір
інструмента). З --answers — повний шлях, як у чаті: вибір, виконання
інструментів на сталій фікстурі в окремій базі finance_eval, відповідь.

Безкоштовний тариф Groq обмежує токени за хвилину й запити за добу,
окремо для кожної моделі. Готові кейси зберігаються в
eval/runs/<модель>-<режим>.jsonl, тож прогін, перерваний лімітом,
продовжується тією самою командою з місця зупинки. Кожна модель працює зі
своєю базою, тож кілька моделей можна проганяти одночасно.

Запуск із теки backend:
    python -m eval.run_routing
    python -m eval.run_routing --answers --csv eval/results.csv
    python -m eval.run_routing --answers --model openai/gpt-oss-20b --compare
"""

import argparse
import asyncio
import csv
import json
import re
import sys
import time
from pathlib import Path

from app.database import settings
from app.llm import LLMUnavailable, chat_completion, is_configured
from app.routers.chat import plain_text, run_tool_calls
from app.timeutils import frozen_today
from app.tools import system_prompt, tool_schemas
from eval.cases import CASES, TODAY, EvalCase
from eval.faithfulness import check
from eval.scoring import PATHS, args_mismatch, path_of, summarise

EVAL_DIR = Path(__file__).parent
RUNS = EVAL_DIR / "runs"
COMPARISON = EVAL_DIR / "models_comparison.csv"

# Пауза між кейсами: без неї безкоштовний ліміт запитів за хвилину
# вичерпується десь на половині набору.
PACE_SECONDS = 2.5
# Безкоштовний тариф дає 8000 токенів на хвилину, а кейс з повною
# відповіддю — це 6–7 тисяч. Тож після 429 чекаємо, поки хвилинне вікно
# звільниться, і повторюємо той самий кейс. Кілька відмов поспіль — уже не
# хвилинний, а добовий ліміт: тоді зупиняємось і зберігаємо зроблене.
LIMIT_WAIT_SECONDS = 65
LIMIT_RETRIES = 4


class RateLimited(RuntimeError):
    """Провайдер відмовив через ліміт навіть після повторів — далі немає сенсу."""


async def _complete(messages: list[dict], model: str, tools: list | None = None) -> dict:
    try:
        return await chat_completion(messages, tools=tools, model=model)
    except LLMUnavailable as exc:
        if "ліміт" in str(exc):
            raise RateLimited(str(exc)) from exc
        raise


async def run_case(item: EvalCase, model: str, sessions, user_id) -> dict:
    """Один кейс: вибір інструмента і, якщо є база, повна відповідь."""
    started = time.perf_counter()
    messages = [{"role": "system", "content": system_prompt()}, {"role": "user", "content": item.question}]
    first = await _complete(messages, model, tool_schemas())
    calls = first.get("tool_calls") or []
    tool = calls[0]["function"]["name"] if calls else None
    try:
        arguments = json.loads(calls[0]["function"]["arguments"] or "{}") if calls else {}
    except json.JSONDecodeError:
        arguments = {}

    row = {"tool": tool, "arguments": arguments, "answer": None, "payloads": None}
    if sessions is not None:
        payloads: list = []
        if calls:
            async with sessions() as session:
                run = await run_tool_calls(session, user_id, calls)
            payloads = run.payloads
            final = await _complete([*messages, first, *run.messages], model)
            answer = final.get("content") or ""
        else:
            answer = first.get("content") or ""
        row["answer"] = plain_text(answer)
        row["payloads"] = payloads
    row["seconds"] = round(time.perf_counter() - started, 2)
    return row


def score(item: EvalCase, raw: dict) -> dict:
    """Метрики одного кейсу з сирого результату (див. run_case)."""
    if raw.get("error"):
        return {"soft_ok": False, "strict_ok": False, "args_ok": False if item.expected_args else None,
                "faithful": None, "seconds": None, "chosen": "—", "mismatch": [], "unsupported": []}
    chosen = path_of(raw["tool"])
    args_ok, mismatch = None, []
    if item.expected_args:
        if chosen != item.primary:
            args_ok, mismatch = False, ["інший інструмент"]
        else:
            mismatch = args_mismatch(item.expected_args, raw["arguments"])
            args_ok = not mismatch
    faithful, unsupported = None, []
    if raw.get("answer") is not None:
        report = check(raw["answer"], raw["payloads"], item.question)
        faithful, unsupported = report.ok, report.unsupported
    return {
        "soft_ok": chosen in item.expected,
        "strict_ok": chosen == item.primary,
        "args_ok": args_ok,
        "faithful": faithful,
        "seconds": raw.get("seconds"),
        "chosen": chosen,
        "mismatch": mismatch,
        "unsupported": unsupported,
    }


def _yes(value) -> str:
    return "—" if value is None else ("так" if value else "ні")


def csv_row(index: int, item: EvalCase, raw: dict, scored: dict) -> dict:
    return {
        "№": index,
        "запит": item.question,
        "найкращий": item.primary,
        "прийнятні": "/".join(sorted(item.expected)),
        "обрано": scored["chosen"],
        "вірно мʼяко": _yes(scored["soft_ok"]),
        "вірно строго": _yes(scored["strict_ok"]),
        "аргументи": json.dumps(raw.get("arguments", {}), ensure_ascii=False),
        "аргументи вірні": _yes(scored["args_ok"]),
        "розбіжності аргументів": ", ".join(scored["mismatch"]),
        "відповідь": raw.get("answer") or "",
        "числа з даних": _yes(scored["faithful"]),
        "вигадані числа": ", ".join(scored["unsupported"]),
        "секунд": raw.get("seconds") or "",
        "помилка": raw.get("error") or "",
    }


def database_for(model: str) -> str:
    """Своя база для кожної моделі, щоб паралельні прогони не заважали."""
    return "finance_eval_" + re.sub(r"[^a-z0-9]+", "_", model.lower()).strip("_")


def _load(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    rows = (json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    return {row["question"]: row for row in rows}


def _percent(part: int, whole: int) -> str:
    return f"{part}/{whole} = {part / whole:.1%}" if whole else "—"


COMPARISON_FIELDS = [
    "модель", "кейсів", "строга точність", "мʼяка точність", "аргументи вірні", "faithfulness",
    "медіана часу вибору, с", "середній час вибору, с",
]


def write_comparison(model: str, answers: bool, summary) -> None:
    """Оновлює рядок моделі в eval/models_comparison.csv (інші рядки лишаються).

    Режими пишуть різні колонки й не перетирають одне одного. Точність,
    аргументи й час — з прогону без --answers: там один виклик на кейс, і
    час моделей порівнюваний. Faithfulness — з прогону з --answers. Так
    повні відповіді можна рахувати лише для основної моделі й не витрачати
    безкоштовну квоту на всі.
    """
    rows: dict[str, dict] = {}
    if COMPARISON.exists():
        with COMPARISON.open(encoding="utf-8-sig") as handle:
            rows = {r["модель"]: r for r in csv.DictReader(handle, delimiter=";")}
    share = summary.share
    row = {field: "" for field in COMPARISON_FIELDS} | rows.get(model, {}) | {"модель": model}
    if answers:
        row["faithfulness"] = f"{share(summary.faithful, summary.answers_total):.3f}"
    else:
        row |= {
            "кейсів": summary.total,
            "строга точність": f"{share(summary.strict, summary.total):.3f}",
            "мʼяка точність": f"{share(summary.soft, summary.total):.3f}",
            "аргументи вірні": f"{share(summary.args_ok, summary.args_total):.3f}",
            "медіана часу вибору, с": f"{summary.median_seconds:.2f}",
            "середній час вибору, с": f"{summary.seconds:.2f}",
        }
    rows[model] = {field: row.get(field, "") for field in COMPARISON_FIELDS}
    fields = COMPARISON_FIELDS
    with COMPARISON.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter=";")
        writer.writeheader()
        writer.writerows(rows.values())


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=settings.LLM_MODEL, help="Модель провайдера (за замовчуванням LLM_MODEL)")
    parser.add_argument("--answers", action="store_true", help="Повні відповіді + перевірка чисел")
    parser.add_argument("--csv", help="Додатково зберегти таблицю сюди")
    parser.add_argument("--compare", action="store_true", help="Оновити рядок у eval/models_comparison.csv")
    parser.add_argument("--fresh", action="store_true", help="Почати заново, не беручи збережених кейсів")
    args = parser.parse_args()

    if not is_configured():
        print("Не задано ключ LLM — немає що оцінювати.")
        return 1

    RUNS.mkdir(exist_ok=True)
    slug = f"{args.model.replace('/', '_')}-{'answers' if args.answers else 'routing'}"
    cache_path = RUNS / f"{slug}.jsonl"
    done = {} if args.fresh else _load(cache_path)
    if args.fresh and cache_path.exists():
        cache_path.unlink()

    engine = sessions = user_id = None
    if args.answers:
        from eval.evaldb import open_eval_db

        engine, sessions, user_id = await open_eval_db(database_for(args.model))

    stopped = None
    try:
        with frozen_today(TODAY):
            for index, item in enumerate(CASES, 1):
                if item.question in done:
                    continue
                if index > 1:
                    await asyncio.sleep(PACE_SECONDS)
                raw = None
                for attempt in range(LIMIT_RETRIES + 1):
                    try:
                        raw = await run_case(item, args.model, sessions, user_id)
                        break
                    except RateLimited as exc:
                        if attempt == LIMIT_RETRIES:
                            stopped = str(exc)
                        else:
                            print(f"  … ліміт провайдера, чекаю {LIMIT_WAIT_SECONDS} с")
                            await asyncio.sleep(LIMIT_WAIT_SECONDS)
                    except LLMUnavailable as exc:
                        raw = {"error": str(exc)}
                        break
                if raw is None:
                    break
                raw["question"] = item.question
                done[item.question] = raw
                with cache_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(raw, ensure_ascii=False, default=str) + "\n")
                scored = score(item, raw)
                mark = " OK " if scored["strict_ok"] else ("~ok~" if scored["soft_ok"] else "ХИБА")
                extra = "" if scored["faithful"] in (None, True) else f"  вигадано: {', '.join(scored['unsupported'])}"
                print(f"{mark} [{index:2}] {scored['chosen']:7} (найкр. {item.primary:7}) {item.question}{extra}")
    finally:
        if engine is not None:
            await engine.dispose()

    if stopped:
        print(f"\nЗупинено: {stopped}")
        print(f"Готово {len(done)}/{len(CASES)}. Запустіть ту саму команду пізніше — прогін продовжиться.")
        return 2

    # Кеш дописується по рядку; якщо кейс прогнано двічі (перерваний запуск),
    # лишаємо останній результат, щоб файл відповідав таблиці.
    cache_path.write_text(
        "".join(json.dumps(done[item.question], ensure_ascii=False, default=str) + "\n" for item in CASES),
        encoding="utf-8",
    )
    rows = [(index, item, done[item.question]) for index, item in enumerate(CASES, 1)]
    scored_rows = [score(item, raw) for _, item, raw in rows]
    summary = summarise(scored_rows)

    print(f"\nМодель: {args.model}; «сьогодні» = {TODAY}")
    print(f"Строга точність (лише найкращий шлях): {_percent(summary.strict, summary.total)}")
    print(f"Мʼяка точність (будь-який прийнятний): {_percent(summary.soft, summary.total)}")
    print(f"Аргументи вірні:                       {_percent(summary.args_ok, summary.args_total)}")
    if args.answers:
        print(f"Відповіді без вигаданих чисел:         {_percent(summary.faithful, summary.answers_total)}")
    print(f"Час на запит: медіана {summary.median_seconds:.2f} с, середнє {summary.seconds:.2f} с")

    print("\nСтрога точність за типом запиту:")
    for path in PATHS:
        subset = [s for (_, item, _), s in zip(rows, scored_rows) if item.primary == path]
        if subset:
            print(f"  {path:8} {sum(s['strict_ok'] for s in subset)}/{len(subset)}")

    problems = [(i, item, s) for (i, item, _), s in zip(rows, scored_rows) if not s["strict_ok"] or s["args_ok"] is False]
    if problems:
        print("\nПомилки маршрутизації й аргументів:")
        for index, item, s in problems:
            detail = f"аргументи: {', '.join(s['mismatch'])}" if s["mismatch"] else ""
            print(f"  [{index:2}] «{item.question}» -> {s['chosen']} (найкр. {item.primary}) {detail}")
    unfaithful = [(i, item, s) for (i, item, _), s in zip(rows, scored_rows) if s["faithful"] is False]
    if unfaithful:
        print("\nЧисла, яких немає ні в даних, ні в питанні:")
        for index, item, s in unfaithful:
            print(f"  [{index:2}] «{item.question}»: {', '.join(s['unsupported'])}")

    table = [csv_row(i, item, raw, s) for (i, item, raw), s in zip(rows, scored_rows)]
    for path in [RUNS / f"{slug}.csv", *([Path(args.csv)] if args.csv else [])]:
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(table[0]), delimiter=";")
            writer.writeheader()
            writer.writerows(table)
        print(f"\nТаблицю збережено: {path}")
    if args.compare:
        write_comparison(args.model, args.answers, summary)
        print(f"Рядок моделі оновлено: {COMPARISON}")
    return 0


if __name__ == "__main__":
    if "--answers" in sys.argv:
        from eval.evaldb import prepare_database

        model = sys.argv[sys.argv.index("--model") + 1] if "--model" in sys.argv else settings.LLM_MODEL
        prepare_database(database_for(model))
    sys.exit(asyncio.run(main()))
