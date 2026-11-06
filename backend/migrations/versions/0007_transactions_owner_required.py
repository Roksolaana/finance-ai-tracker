"""Кожна транзакція має власника: transactions.user_id NOT NULL.

Записи без власника лишились з часів до акаунтів, і їх забирав собі перший
зареєстрований користувач. На свіжій установці це означало, що перший,
хто зареєструвався, отримував чужі дані. Правило прибрано з реєстрації,
а колонка стає обовʼязковою.

Якщо такі записи все ж є, міграція зупиняється, а не видаляє їх: видалення
не можна відкотити, а зупинка нічого не губить і прямо каже, що зробити.
Рішення, кому вони належать, — за людиною, а не за міграцією.

Revision ID: 0007
Revises: 0006
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    orphans = op.get_bind().execute(sa.text("SELECT count(*) FROM transactions WHERE user_id IS NULL")).scalar_one()
    if orphans:
        raise RuntimeError(
            f"У таблиці transactions {orphans} записів без власника (user_id IS NULL). "
            "Міграція 0007 робить власника обовʼязковим і не видаляє дані сама. "
            "Призначте записам власника: UPDATE transactions SET user_id = '<id акаунта>' "
            "WHERE user_id IS NULL; або видаліть їх, якщо вони не потрібні, і запустіть сервер знову."
        )
    op.alter_column("transactions", "user_id", existing_type=sa.UUID(), nullable=False)


def downgrade() -> None:
    op.alter_column("transactions", "user_id", existing_type=sa.UUID(), nullable=True)
