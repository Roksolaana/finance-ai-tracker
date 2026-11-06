"""Теги настрою: transactions.tags.

Настрій і привід витрати раніше жили лише в тексті нотатки, і запис без
нотатки для пошуку за змістом не існував. Тег — явна позначка користувача з
фіксованого набору (app/constants.py, MOOD_TAGS).

Ембединг тегів не враховує: його рахують з нотатки, як і раніше, тож пороги
релевантності й оцінка пошуку лишаються чинними. Тег, названий у запиті,
перевіряється окремою SQL-умовою (app/search.py).

Revision ID: 0010
Revises: 0009
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'"),
            nullable=False,
            comment="Теги настрою з фіксованого набору: стрес, втома, свято, …",
        ),
    )


def downgrade() -> None:
    op.drop_column("transactions", "tags")
