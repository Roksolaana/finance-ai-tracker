"""Відкликання токенів: users.token_version.

JWT перевіряється лише підписом, тож виданий токен діяв до кінця свого
терміну (30 днів) навіть після зміни пароля — вкрадений токен не було чим
скасувати. Тепер у токені є клейм `ver`, і він мусить збігатися з
token_version користувача. «Вийти на всіх пристроях» і зміна пароля
збільшують версію, тож усі раніше видані токени стають недійсними.

Revision ID: 0008
Revises: 0007
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
            comment="Версія токенів; збільшується, щоб відкликати всі видані раніше",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
