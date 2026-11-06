"""Точність підказки категорії (kNN по ембедингах) методом leave-one-out.

Для кожної транзакції з нотаткою підказка будується з усіх інших записів
того самого користувача, і порівнюється зі справжньою категорією.

Два варіанти, бо перший сам по собі вводить в оману:
  звичайний LOO      — прибирається лише сам запис. Але та сама нотатка
                       повторюється («Кава з автомата» — 6 разів), і запис
                       просто знаходить власну копію;
  без копій нотатки  — прибираються всі записи з тим самим текстом. Це
                       ближче до справжнього випадку: нова, ще не бачена фраза.

Дані — стала фікстура в окремій базі, LLM не викликається.

Запуск із теки backend:
    python -m eval.run_categories
"""

import asyncio
import sys

from sqlalchemy import select

from app.categorize import suggest_category
from app.models import Transaction
from eval.evaldb import open_eval_db, prepare_database

# Пороги впевненості для таблиці. Інтерфейс підставляє категорію сам лише
# при 1.0 (усі 5 сусідів згодні): нижче впевненість погано відділяє
# правильні підказки від хибних, і на новій фразі підказка частіше
# помилялась би, ніж влучала. Слабшу підказку інтерфейс лише пропонує.
THRESHOLDS = (0.6, 0.8, 1.0)


async def evaluate(sessions, user_id, by_note: bool) -> dict:
    results: list[tuple[bool, float]] = []
    async with sessions() as session:
        rows = (
            await session.execute(
                select(Transaction).where(Transaction.user_id == user_id, Transaction.embedding.is_not(None))
            )
        ).scalars().all()
        for row in rows:
            exclude = {"exclude_note": row.note} if by_note else {"exclude_id": row.id}
            category, confidence = await suggest_category(session, user_id, list(row.embedding), **exclude)
            results.append((category == row.category, confidence if category is not None else 0.0))
    total = len(results)
    by_threshold = {}
    for threshold in THRESHOLDS:
        chosen = [ok for ok, confidence in results if confidence >= threshold]
        by_threshold[threshold] = (sum(chosen) / len(chosen) if chosen else 0.0, len(chosen) / total)
    return {"total": total, "accuracy": sum(ok for ok, _ in results) / total, "by_threshold": by_threshold}


async def main() -> int:
    engine, sessions, user_id = await open_eval_db()
    try:
        for label, by_note in (("звичайний LOO", False), ("без копій тієї самої нотатки", True)):
            r = await evaluate(sessions, user_id, by_note)
            print(f"{label} ({r['total']} записів): точність усіх підказок {r['accuracy']:.1%}")
            for threshold, (accuracy, share) in r["by_threshold"].items():
                mark = "  <- інтерфейс підставляє сам" if threshold == 1.0 else ""
                print(f"  упевненість ≥ {threshold:.1f}: точність {accuracy:.1%} на {share:.0%} записів{mark}")
    finally:
        await engine.dispose()
    return 0


if __name__ == "__main__":
    prepare_database()
    sys.exit(asyncio.run(main()))
