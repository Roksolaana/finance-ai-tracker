"""Історія чату: таблиця chat_messages.

Розмова з асистентом зберігається на сервері, а не в памʼяті застосунку:
вона не губиться при повторному відкритті й однакова на ноутбуці й телефоні.
`tool_call` — те саме, що віддає відповідь чату (який інструмент, скільки
тривало, які записи знайдено), щоб після перезавантаження показати ті самі
знайдені записи.

Revision ID: 0004
Revises: 0003
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_call", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="chat_messages_pkey"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="chat_messages_user_id_fkey", ondelete="CASCADE"),
    )
    op.create_index("ix_chat_messages_user_created", "chat_messages", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_user_created", table_name="chat_messages")
    op.drop_table("chat_messages")
