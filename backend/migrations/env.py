"""Alembic: запуск міграцій через той самий async-двигун, що й застосунок."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from app.database import settings
from app.migrate import DatabaseUnavailable
from app.models import Base

config = context.config
if config.config_file_name is not None:
    # disable_existing_loggers=False обовʼязково: міграції запускаються зі
    # startup застосунку, і зі значенням за замовчуванням вони глушили б
    # логи доступу uvicorn на весь час роботи процесу.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def _run_online() -> None:
    engine = create_async_engine(settings.DATABASE_URL, poolclass=pool.NullPool)
    # Помилки зʼєднання asyncpg приходять сирими й різнотипними
    # (ConnectionRefusedError, gaierror, InvalidPasswordError, …), тож
    # «база недоступна» визначаємо за місцем падіння, а не за типом:
    # усе, що впало до встановлення зʼєднання, — проблема доступу,
    # усе після — проблема самої міграції.
    try:
        connection = await engine.connect()
    except Exception as exc:
        await engine.dispose()
        raise DatabaseUnavailable(f"{type(exc).__name__}: {exc}") from exc
    try:
        await connection.run_sync(_run)
    finally:
        await connection.close()
        await engine.dispose()


if context.is_offline_mode():
    context.configure(url=settings.DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(_run_online())
