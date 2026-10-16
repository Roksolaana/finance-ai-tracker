"""Дозаповнює ембединги для транзакцій, у яких їх ще немає.

Потрібен після додавання семантичного пошуку до вже наявних даних, а також
якщо модель була недоступна в момент створення запису.

Запуск із теки backend:
    python -m app.backfill_embeddings
"""

import asyncio
import logging

from sqlalchemy import select, update

from app.database import async_session
from app.embeddings import embed
from app.models import Transaction

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

BATCH = 128


async def main() -> None:
    async with async_session() as session:
        rows = (
            await session.execute(
                select(Transaction.id, Transaction.note).where(
                    Transaction.note.is_not(None), Transaction.embedding.is_(None)
                )
            )
        ).all()

        if not rows:
            logger.info("Усі нотатки вже мають ембединги.")
            return

        logger.info("Нотаток без ембедингів: %d", len(rows))
        for start in range(0, len(rows), BATCH):
            chunk = rows[start : start + BATCH]
            vectors = embed([note for _, note in chunk])
            for (transaction_id, _), vector in zip(chunk, vectors):
                await session.execute(
                    update(Transaction).where(Transaction.id == transaction_id).values(embedding=vector)
                )
            await session.commit()
            logger.info("  опрацьовано %d / %d", min(start + BATCH, len(rows)), len(rows))

        logger.info("Готово.")


if __name__ == "__main__":
    asyncio.run(main())
