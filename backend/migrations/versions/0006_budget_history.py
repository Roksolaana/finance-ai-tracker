"""Історія лімітів бюджету: таблиця budget_history.

Таблиця budgets зберігає лише поточний ліміт, тож після його зміни минулі
місяці теж рахувались за новим. Тепер кожна версія має valid_from — перше
число місяця, з якого вона діє.

Наявні ліміти переносяться з valid_from = місяць їхньої останньої зміни
(updated_at за місцевим часом): раніше ніж тоді ліміт точно не встановлено,
а як він виглядав до останньої зміни, уже не відновити.

Revision ID: 0006
Revises: 0005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.database import settings

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budget_history",
        sa.Column("user_id", sa.UUID(), nullable=False, comment="Власник ліміту"),
        sa.Column("category", sa.String(100), nullable=False, comment="Витратна категорія, на яку встановлено ліміт"),
        sa.Column(
            "valid_from", sa.Date(), nullable=False, comment="Перше число місяця, з якого діє ця версія ліміту"
        ),
        sa.Column(
            "monthly_limit",
            sa.Numeric(12, 2),
            nullable=True,
            comment="Ліміт витрат на місяць; NULL — з цього місяця ліміт знято",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Коли версію записано або востаннє змінено",
        ),
        sa.PrimaryKeyConstraint("user_id", "category", "valid_from", name="budget_history_pkey"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="budget_history_user_id_fkey", ondelete="CASCADE"),
        sa.CheckConstraint("extract(day from valid_from) = 1", name="budget_history_valid_from_first_day"),
    )
    op.execute(
        sa.text(
            "INSERT INTO budget_history (user_id, category, valid_from, monthly_limit) "
            "SELECT user_id, category, date_trunc('month', timezone(:tz, updated_at))::date, monthly_limit "
            "FROM budgets"
        ).bindparams(tz=settings.APP_TIMEZONE)
    )


def downgrade() -> None:
    op.drop_table("budget_history")
