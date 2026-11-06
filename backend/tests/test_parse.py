"""Введення транзакції природною мовою: чернетка без збереження."""

import datetime
import json

import pytest

from app.parsing import parse_rules
from app.timeutils import TZ, frozen_today

TODAY = datetime.date(2026, 10, 16)
URL = "/api/v1/transactions/parse"


@pytest.mark.parametrize(
    "text, amount, category, days_ago, tags",
    [
        ("кава 85 бо не виспалась", -85, "кафе", 0, ["втома"]),
        ("вчора таксі 230", -230, "транспорт", 1, []),
        ("стипендія 2000", 2000, "дохід", 0, []),
        ("позавчора продукти в АТБ 450", -450, "їжа", 2, []),
        ("Netflix 199", -199, "підписки", 0, []),
        ("ліки в аптеці 320 грн", -320, "здоров'я", 0, []),
        ("квиток у кіно 180 з друзями", -180, "розваги", 0, ["з друзями"]),
        ("піца з одногрупницями 560", -560, "кафе", 0, ["з друзями"]),
        ("кросівки 2 400", -2400, "покупки", 0, []),
        ("оплатила гуртожиток 900", -900, "комунальні", 0, []),
        ("зарплата за фріланс 3500", 3500, "дохід", 0, []),
        ("купила помаду спонтанно 320", -320, "покупки", 0, ["імпульс"]),
        ("шоколадка 45, бо перенервувала перед заліком", -45, "їжа", 0, ["стрес"]),
        ("подарунок мамі на день народження 700", -700, "покупки", 0, ["свято"]),
        ("трамвай 8", -8, "транспорт", 0, []),
        ("обід 125,50", -125.5, "кафе", 0, []),
        ("щось 100", -100, "інше", 0, []),
        ("вчора ввечері Bolt додому 145 ₴, без сил", -145, "транспорт", 1, ["втома"]),
    ],
)
def test_rules_parser(text, amount, category, days_ago, tags):
    with frozen_today(TODAY):
        draft = parse_rules(text)
    assert draft.amount == amount
    assert draft.category == category
    assert draft.spent_at.astimezone(TZ).date() == TODAY - datetime.timedelta(days=days_ago)
    assert draft.tags == tags
    assert draft.source == "rules"


def test_rules_parser_keeps_meaning_in_note():
    with frozen_today(TODAY):
        draft = parse_rules("вчора таксі 230 бо проспала пару")
    # Сума й «вчора» вже в окремих полях — у нотатці лишається зміст.
    assert draft.note == "Таксі бо проспала пару"


def test_text_without_amount_gives_draft_without_amount():
    with frozen_today(TODAY):
        draft = parse_rules("кава з собою")
    assert draft.amount is None
    assert draft.category == "кафе"


async def test_parse_endpoint_without_llm_uses_rules(client, alice, monkeypatch):
    headers, _ = alice
    monkeypatch.setattr("app.routers.transactions.is_configured", lambda: False)
    response = await client.post(URL, json={"text": "вчора таксі 230"}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["amount"], body["category"], body["source"]) == (-230, "транспорт", "rules")
    # Чернетка — не запис: у базі нічого не з'явилось.
    assert (await client.get("/api/v1/transactions/", headers=headers)).json()["total"] == 0


def _model_draft(**arguments):
    async def fake_completion(messages, tools=None, model=None, tool_choice=None):
        assert tools and tools[0]["function"]["name"] == "draft_transaction"
        assert tool_choice == {"type": "function", "function": {"name": "draft_transaction"}}
        call = {"id": "c1", "type": "function", "function": {"name": "draft_transaction", "arguments": json.dumps(arguments)}}
        return {"role": "assistant", "content": None, "tool_calls": [call]}

    return fake_completion


async def test_parse_with_llm_sign_and_date_come_from_code(client, alice, monkeypatch):
    headers, _ = alice
    monkeypatch.setattr("app.routers.transactions.is_configured", lambda: True)
    # Модель повернула відʼємну суму для доходу й «позавчора» як число днів —
    # знак ставить код за категорією, дату рахує код від сьогодні.
    monkeypatch.setattr(
        "app.parsing.chat_completion",
        _model_draft(amount=-2000, category="дохід", days_ago=2, note="Стипендія", tags=["свято", "нове"]),
    )
    with frozen_today(TODAY):
        response = await client.post(URL, json={"text": "позавчора прийшла стипендія 2000"}, headers=headers)
    body = response.json()
    assert (body["amount"], body["category"], body["note"], body["source"]) == (2000, "дохід", "Стипендія", "llm")
    assert body["tags"] == ["свято"]
    assert datetime.datetime.fromisoformat(body["spent_at"]).astimezone(TZ).date() == TODAY - datetime.timedelta(days=2)


async def test_parse_falls_back_to_rules_on_bad_model_answer(client, alice, monkeypatch):
    headers, _ = alice
    monkeypatch.setattr("app.routers.transactions.is_configured", lambda: True)
    monkeypatch.setattr("app.parsing.chat_completion", _model_draft(amount="багато", category="їжа"))
    response = await client.post(URL, json={"text": "кава 85"}, headers=headers)
    body = response.json()
    assert (body["amount"], body["category"], body["source"]) == (-85, "кафе", "rules")


async def test_parse_falls_back_when_llm_is_down(client, alice, monkeypatch):
    from app.llm import LLMUnavailable

    headers, _ = alice

    async def down(*args, **kwargs):
        raise LLMUnavailable("Сервіс LLM недоступний")

    monkeypatch.setattr("app.routers.transactions.is_configured", lambda: True)
    monkeypatch.setattr("app.parsing.chat_completion", down)
    response = await client.post(URL, json={"text": "трамвай 8"}, headers=headers)
    assert response.json()["source"] == "rules"


async def test_parse_rejects_empty_text(client, alice):
    headers, _ = alice
    assert (await client.post(URL, json={"text": "   "}, headers=headers)).status_code == 422
