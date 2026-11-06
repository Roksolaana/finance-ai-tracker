"""Одне джерело лімітів: таблиця budgets прибрана, лишається budget_history.

Після 0006 поточний ліміт зберігався двічі — у budgets і останньою версією
історії. Два записи того самого факту рано чи пізно розходяться, а код мав
окреме правило для ліміту, якого немає в історії. Тепер поточний ліміт — це
останній запис історії, і правило одне.

Перед видаленням рядки budgets, які з якоїсь причини не мають жодної версії
в історії, переносяться туди так само, як у 0006: з valid_from = місяць
останньої зміни. Через API такий рядок виникнути не міг, але міграція не має
мовчки губити дані.

Revision ID: 0009
Revises: 0008
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.database import settings

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO budget_history (user_id, category, valid_from, monthly_limit) "
            "SELECT b.user_id, b.category, date_trunc('month', timezone(:tz, b.updated_at))::date, b.monthly_limit "
            "FROM budgets b "
            "WHERE NOT EXISTS (SELECT 1 FROM budget_history h "
            "WHERE h.user_id = b.user_id AND h.category = b.category)"
        ).bindparams(tz=settings.APP_TIMEZONE)
    )
    op.drop_table("budgets")


def downgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("user_id", sa.UUID(), nullable=False, comment="Власник ліміту"),
        sa.Column("category", sa.String(100), nullable=False, comment="Витратна категорія, на яку встановлено ліміт"),
        sa.Column("monthly_limit", sa.Numeric(12, 2), nullable=False, comment="Ліміт витрат на місяць"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Коли ліміт останній раз змінювали",
        ),
        sa.PrimaryKeyConstraint("user_id", "category", name="budgets_pkey"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="budgets_user_id_fkey", ondelete="CASCADE"),
    )
    # Поточний ліміт — остання версія; знятий (NULL) у budgets не потрапляє.
    op.execute(
        "INSERT INTO budgets (user_id, category, monthly_limit, updated_at) "
        "SELECT user_id, category, monthly_limit, created_at FROM ("
        "  SELECT DISTINCT ON (user_id, category) user_id, category, monthly_limit, created_at "
        "  FROM budget_history ORDER BY user_id, category, valid_from DESC"
        ") latest WHERE monthly_limit IS NOT NULL"
    )
