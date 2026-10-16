"""Користувачі: таблиця users, привʼязка транзакцій і бюджетів до власника.

`transactions.user_id` робимо nullable: записи, створені до появи акаунтів,
не мають власника й нікому не належать. Їх забирає собі перший
зареєстрований акаунт (див. `routers/auth.py`), щоб нічого не загубити.

`budgets` отримує складений первинний ключ (user_id, category), бо ліміт
тепер свій у кожного користувача. Ліміти без власника видаляються — це
просто налаштування, які користувач задає повторно.

Revision ID: 0003
Revises: 0002
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, comment="Логін у нижньому регістрі"),
        sa.Column("password_hash", sa.String(255), nullable=False, comment="bcrypt-хеш пароля"),
        sa.Column("display_name", sa.String(100), nullable=False, comment="Імʼя для інтерфейсу"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="users_pkey"),
        sa.UniqueConstraint("email", name="users_email_key"),
    )

    op.add_column("transactions", sa.Column("user_id", sa.UUID(), nullable=True, comment="Власник транзакції"))
    op.create_foreign_key(
        "transactions_user_id_fkey", "transactions", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_transactions_user_spent_at", "transactions", ["user_id", "spent_at"])

    # Ліміти без власника неможливо нікому приписати, а відновити їх —
    # це просто ввести числа заново в діалозі «Ліміти бюджету».
    op.execute("DELETE FROM budgets")
    op.add_column("budgets", sa.Column("user_id", sa.UUID(), nullable=False, comment="Власник ліміту"))
    op.drop_constraint("budgets_pkey", "budgets", type_="primary")
    op.create_primary_key("budgets_pkey", "budgets", ["user_id", "category"])
    op.create_foreign_key("budgets_user_id_fkey", "budgets", "users", ["user_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint("budgets_user_id_fkey", "budgets", type_="foreignkey")
    op.drop_constraint("budgets_pkey", "budgets", type_="primary")
    op.execute("DELETE FROM budgets")
    op.drop_column("budgets", "user_id")
    op.create_primary_key("budgets_pkey", "budgets", ["category"])

    op.drop_index("ix_transactions_user_spent_at", table_name="transactions")
    op.drop_constraint("transactions_user_id_fkey", "transactions", type_="foreignkey")
    op.drop_column("transactions", "user_id")

    op.drop_table("users")
