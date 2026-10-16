"""Початкова схема: транзакції (ще під назвою expenses) та бюджети.

Revision ID: 0001
Revises:
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Розширення для семантичного пошуку; vector(384) без нього не створиться.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "expenses",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, comment="Сума (відʼємне — витрата, додатне — дохід)"),
        sa.Column("category", sa.String(100), nullable=False, comment="Категорія: їжа, транспорт, …"),
        sa.Column("spent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("note", sa.Text(), nullable=True, comment="Довільний коментар користувача"),
        sa.Column("embedding", Vector(384), nullable=True, comment="Ембединг нотатки (384-dim)"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="expenses_pkey"),
    )
    op.create_index("ix_expenses_category", "expenses", ["category"])
    # Під фільтрацію за періодом і категорією.
    op.create_index("ix_expenses_spent_at_category", "expenses", ["spent_at", "category"])
    # HNSW під косинусну відстань; m/ef_construction збалансовані для < 100k записів.
    op.create_index(
        "ix_expenses_embedding_hnsw",
        "expenses",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    op.create_table(
        "budgets",
        sa.Column("category", sa.String(100), nullable=False, comment="Витратна категорія з лімітом"),
        sa.Column("monthly_limit", sa.Numeric(12, 2), nullable=False, comment="Ліміт витрат на місяць"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("category", name="budgets_pkey"),
    )


def downgrade() -> None:
    op.drop_table("budgets")
    op.drop_index("ix_expenses_embedding_hnsw", table_name="expenses")
    op.drop_index("ix_expenses_spent_at_category", table_name="expenses")
    op.drop_index("ix_expenses_category", table_name="expenses")
    op.drop_table("expenses")
