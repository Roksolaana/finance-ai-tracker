"""Коментарі колонок — як у app/models.py.

Коментарі в робочій базі розійшлися з міграціями: частину правили руками,
і в transactions.amount лишився обернений знак («додатне — витрата»), хоча
застосунок давно рахує навпаки. Свіжа база, створена міграціями, мала інші
тексти, ніж робоча. Тут усі коментарі виставляються явно, тож після цієї
ревізії обидві бази однакові.

Тексти скопійовано сюди, а не взято з моделей імпортом: міграція має
робити те саме й тоді, коли моделі зміняться.

Revision ID: 0005
Revises: 0004
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# None — коментаря в колонки немає (у моделі він не заданий).
COMMENTS: dict[str, dict[str, str | None]] = {
    "users": {
        "id": None,
        "email": "Логін користувача, зберігається у нижньому регістрі",
        "password_hash": "bcrypt-хеш пароля",
        "display_name": "Імʼя, яке показується в інтерфейсі",
        "created_at": None,
    },
    "transactions": {
        "id": None,
        "user_id": "Власник транзакції",
        "amount": "Сума транзакції (відʼємне — витрата, додатне — дохід)",
        "category": "Категорія: їжа, транспорт, розваги, …",
        "spent_at": "Коли відбулась транзакція",
        "note": "Довільний коментар користувача",
        "embedding": "Вектор ембедінгу для семантичного пошуку (384-dim)",
        "created_at": "Дата створення запису",
    },
    "budgets": {
        "user_id": "Власник ліміту",
        "category": "Витратна категорія, на яку встановлено ліміт",
        "monthly_limit": "Ліміт витрат на місяць",
        "updated_at": "Коли ліміт останній раз змінювали",
    },
    "chat_messages": {
        "id": None,
        "user_id": "Власник розмови",
        "role": "user або assistant",
        "content": "Текст повідомлення",
        "tool_call": "Інструмент і знайдені записи (лише у відповідей асистента)",
        "created_at": None,
    },
}

# Що створювали міграції 0001–0004 — для downgrade.
PREVIOUS: dict[str, dict[str, str | None]] = {
    "users": {
        "id": None,
        "email": "Логін у нижньому регістрі",
        "password_hash": "bcrypt-хеш пароля",
        "display_name": "Імʼя для інтерфейсу",
        "created_at": None,
    },
    "transactions": {
        "id": None,
        "user_id": "Власник транзакції",
        "amount": "Сума (відʼємне — витрата, додатне — дохід)",
        "category": "Категорія: їжа, транспорт, …",
        "spent_at": None,
        "note": "Довільний коментар користувача",
        "embedding": "Ембединг нотатки (384-dim)",
        "created_at": None,
    },
    "budgets": {
        "user_id": "Власник ліміту",
        "category": "Витратна категорія з лімітом",
        "monthly_limit": "Ліміт витрат на місяць",
        "updated_at": None,
    },
    "chat_messages": {
        "id": None,
        "user_id": None,
        "role": None,
        "content": None,
        "tool_call": None,
        "created_at": None,
    },
}


def _apply(comments: dict[str, dict[str, str | None]]) -> None:
    # COMMENT ON не приймає параметрів запиту, тож рядок підставляється в
    # SQL напряму з подвоєнням лапок. Тексти тут свої, не від користувача.
    for table, columns in comments.items():
        for column, comment in columns.items():
            value = "NULL" if comment is None else "'" + comment.replace("'", "''") + "'"
            op.execute(f'COMMENT ON COLUMN "{table}"."{column}" IS {value}')


def upgrade() -> None:
    _apply(COMMENTS)


def downgrade() -> None:
    _apply(PREVIOUS)
