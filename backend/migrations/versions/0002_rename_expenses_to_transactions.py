"""Перейменування expenses → transactions.

Таблиця зберігає і витрати, і доходи, тому назва «expenses» була неточною
й не збігалася з назвами у фронтенді та в плані роботи.

Revision ID: 0002
Revises: 0001
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# RENAME зберігає дані — рядки не переливаються й не губляться.
RENAMES = (
    ("expenses_pkey", "transactions_pkey"),
    ("ix_expenses_category", "ix_transactions_category"),
    ("ix_expenses_spent_at_category", "ix_transactions_spent_at_category"),
    ("ix_expenses_embedding_hnsw", "ix_transactions_embedding_hnsw"),
)


def upgrade() -> None:
    op.rename_table("expenses", "transactions")
    for old, new in RENAMES:
        op.execute(f"ALTER INDEX {old} RENAME TO {new}")


def downgrade() -> None:
    for old, new in RENAMES:
        op.execute(f"ALTER INDEX {new} RENAME TO {old}")
    op.rename_table("transactions", "expenses")
