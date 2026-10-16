"""Запуск Alembic-міграцій із коду.

Міграції застосовуються при старті застосунку, щоб `uvicorn app.main:app`
працював без окремої ручної команди, а схема все одно мала версії.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND_DIR = Path(__file__).resolve().parents[1]


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    # Абсолютний шлях: інакше міграції знаходяться лише коли uvicorn
    # запущено саме з папки backend.
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


def upgrade_to_head() -> None:
    """Доводить схему до останньої ревізії (idempotent)."""
    command.upgrade(alembic_config(), "head")
