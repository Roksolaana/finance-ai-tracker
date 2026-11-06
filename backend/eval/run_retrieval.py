"""Якість семантичного пошуку: precision, recall і F1 окремо для dev і test.

Пороги в app/embeddings.py підібрано на інших даних (робочі нотатки). Тут
вони перевіряються на сталій фікстурі з розміткою eval/retrieval_cases.py:
  1. метрики з порогами, як у коді, — окремо dev і test;
  2. те саме без бонусу за слова (лише вектор) — що дає бонус;
  3. таблиця «поріг → F1» на dev і чи тримається обраний поріг на test.
Пороги в коді скрипт не змінює.

LLM не викликається, лише локальна модель ембедингів.

Запуск із теки backend:
    python -m eval.run_retrieval
"""

import asyncio
import csv
import sys
from pathlib import Path

from app.embeddings import RELEVANCE_THRESHOLD, SHORT_QUERY_THRESHOLD
from app.search import semantic_search
from eval.evaldb import open_eval_db, prepare_database
from eval.retrieval_cases import CASES, RetrievalCase
from eval.scoring import retrieval_scores

OUT = Path(__file__).parent
THRESHOLDS = [round(0.30 + 0.05 * i, 2) for i in range(9)]  # 0.30 … 0.70
# Більше, ніж нотаток у фікстурі: міряємо поріг, а не ліміт переліку.
TOP_K = 1000


async def retrieve(session, user_id, item: RetrievalCase, **options) -> set[str]:
    hits = await semantic_search(session, user_id, item.query, top_k=TOP_K, **options)
    return {hit.transaction.note for hit in hits}


def macro(scores: list[tuple[float, float, float]]) -> tuple[float, float, float]:
    count = len(scores)
    return tuple(sum(s[i] for s in scores) / count for i in range(3))  # type: ignore[return-value]


async def evaluate(sessions, user_id, split: str, **options) -> tuple[tuple[float, float, float], list[dict]]:
    rows, scores = [], []
    async with sessions() as session:
        for item in (c for c in CASES if c.split == split):
            found = await retrieve(session, user_id, item, **options)
            score = retrieval_scores(found, set(item.relevant))
            scores.append(score)
            rows.append(
                {
                    "split": split,
                    "запит": item.query,
                    "precision": round(score[0], 3),
                    "recall": round(score[1], 3),
                    "f1": round(score[2], 3),
                    "знайдено": len(found),
                    "пропущено": " | ".join(sorted(item.relevant - found)),
                    "зайве": " | ".join(sorted(found - item.relevant)),
                }
            )
    return macro(scores), rows


def show(label: str, metrics: tuple[float, float, float]) -> None:
    p, r, f1 = metrics
    print(f"  {label:34} P={p:.2f}  R={r:.2f}  F1={f1:.2f}")


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


async def main() -> int:
    engine, sessions, user_id = await open_eval_db()
    try:
        configs = {
            "вектор + бонус за слова (як у коді)": {},
            "лише вектор": {"use_keywords": False},
        }
        detail: list[dict] = []
        summary: dict[str, dict[str, tuple]] = {}
        for label, options in configs.items():
            summary[label] = {}
            for split in ("dev", "test"):
                metrics, rows = await evaluate(sessions, user_id, split, **options)
                summary[label][split] = metrics
                detail.extend(r | {"конфігурація": label} for r in rows)

        print(f"Пороги з коду: {RELEVANCE_THRESHOLD} (для 1 слова — {SHORT_QUERY_THRESHOLD})\n")
        for split in ("dev", "test"):
            count = sum(c.split == split for c in CASES)
            print(f"{split} ({count} запитів), macro-середнє:")
            for label in configs:
                show(label, summary[label][split])
            print()

        # Єдиний поріг для всіх запитів, бонус увімкнено. У коді для запитів
        # з одного слова поріг вищий — тут він навмисно не застосовується,
        # щоб таблиця залежала від одного числа.
        print("Поріг → F1 на dev (вектор + бонус, єдиний поріг):")
        sweep = []
        for threshold in THRESHOLDS:
            metrics, _ = await evaluate(sessions, user_id, "dev", threshold=threshold)
            sweep.append({"поріг": threshold, "precision": metrics[0], "recall": metrics[1], "f1": metrics[2]})
            mark = "  <- у коді" if threshold == RELEVANCE_THRESHOLD else ""
            print(f"  {threshold:.2f}  P={metrics[0]:.2f}  R={metrics[1]:.2f}  F1={metrics[2]:.2f}{mark}")

        best = max(sweep, key=lambda row: row["f1"])
        best_test, _ = await evaluate(sessions, user_id, "test", threshold=best["поріг"])
        code_dev = summary["вектор + бонус за слова (як у коді)"]["dev"][2]
        code_test = summary["вектор + бонус за слова (як у коді)"]["test"][2]
        print()
        print(f"Найкращий поріг на dev: {best['поріг']:.2f} (F1={best['f1']:.2f}); на test він дає F1={best_test[2]:.2f}")
        print(f"Пороги з коду: F1 dev={code_dev:.2f}, test={code_test:.2f}")

        write_csv(OUT / "retrieval_results.csv", detail)
        write_csv(
            OUT / "retrieval_thresholds.csv",
            [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in row.items()} for row in sweep],
        )
        print("\nТаблиці збережено: eval/retrieval_results.csv, eval/retrieval_thresholds.csv")
    finally:
        await engine.dispose()
    return 0


if __name__ == "__main__":
    prepare_database()
    sys.exit(asyncio.run(main()))
