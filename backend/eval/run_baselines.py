"""Показує, чому потрібні обидва шляхи, а не один.

Той самий запит проганяється примусово через кожен інструмент. Видно, що
чистий SQL не відповідає на запит про зміст, а чистий RAG — на числовий,
тож гібридна маршрутизація не є надлишковою.

Запуск із теки backend:
    python -m eval.run_baselines
"""

import asyncio

from sqlalchemy import select

from app.database import async_session
from app.models import User
from app.tools import query_transactions, semantic_search_notes, hybrid_search_and_sum

# (запит, що це за тип, аргументи для кожного шляху)
PROBES = [
    {
        "question": "Скільки всього я витратила у вересні?",
        "kind": "числовий запит за періодом",
        "sql": {"aggregation": "sum", "date_from": "2026-09-01", "date_to": "2026-09-30", "tx_type": "expense"},
        "rag": {"query_text": "витрати у вересні"},
        "hybrid": {"query_text": "витрати у вересні"},
    },
    {
        "question": "Знайди витрати, які я зробила через стрес чи втому",
        "kind": "запит за змістом нотатки",
        "sql": {"aggregation": "list", "category": "кафе"},
        "rag": {"query_text": "витрати через стрес чи втому"},
        "hybrid": {"query_text": "витрати через стрес чи втому"},
    },
    {
        "question": "Скільки грошей пішло на імпульсивні покупки через стрес?",
        "kind": "сума для множини, заданої змістом",
        "sql": {"aggregation": "sum", "category": "покупки", "tx_type": "expense"},
        "rag": {"query_text": "імпульсивні покупки через стрес"},
        "hybrid": {"query_text": "імпульсивні покупки через стрес"},
    },
]


def summarise(kind: str, payload: dict) -> str:
    if kind == "sql":
        if "total" in payload:
            return f"сума {payload['total']:.0f} ₴ по {payload['count']} записах"
        if "transactions" in payload:
            return f"{len(payload['transactions'])} записів, без підсумку"
        return str(payload)
    if kind == "rag":
        return f"{payload['found']} записів за змістом, без підсумку"
    return f"сума {payload.get('total', 0):.0f} ₴ по {payload.get('count', 0)} записах"


async def main() -> None:
    async with async_session() as db:
        user = (await db.execute(select(User))).scalars().first()
        if user is None:
            print("У базі немає акаунтів.")
            return

        for probe in PROBES:
            print()
            print("=" * 72)
            print(f"Запит: {probe['question']}")
            print(f"Тип:   {probe['kind']}")
            print()

            sql_out = await query_transactions(db, user.id, **probe["sql"])
            rag_out = await semantic_search_notes(db, user.id, **probe["rag"])
            hyb_out = await hybrid_search_and_sum(db, user.id, **probe["hybrid"])

            print(f"  лише SQL     : {summarise('sql', sql_out.payload)}")
            print(f"  лише RAG     : {summarise('rag', rag_out.payload)}")
            print(f"  гібрид       : {summarise('hybrid', hyb_out.payload)}")


if __name__ == "__main__":
    asyncio.run(main())
