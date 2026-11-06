"""Семантичний пошук з бонусом за слова й попередній період асистента."""

import datetime
import math
import uuid

import pytest

from app.models import Transaction
from app.search import _alternatives, semantic_search
from app.timeutils import previous_period
from app.tools import LIST_LIMIT, hybrid_search_and_sum, query_transactions, semantic_search_notes, tool_schemas

D = datetime.date
DIM = 384
WHEN = datetime.datetime(2026, 9, 10, 12, tzinfo=datetime.timezone.utc)


def vector(similarity: float) -> list[float]:
    """Вектор із заданою косинусною схожістю до QUERY_VECTOR."""
    return [similarity, math.sqrt(1 - similarity**2)] + [0.0] * (DIM - 2)


QUERY_VECTOR = vector(1.0)


@pytest.fixture
def fake_embedding(monkeypatch):
    # Справжня модель не потрібна: схожість задаємо самі через вектори нотаток.
    monkeypatch.setattr("app.search.embed_one", lambda text: QUERY_VECTOR)


async def add_note(db, owner, note, similarity, amount=-100, when=WHEN):
    tx = Transaction(user_id=owner, amount=amount, category="інше", spent_at=when, note=note, embedding=vector(similarity))
    db.add(tx)
    await db.commit()
    return tx


# --- попередній період ---


@pytest.mark.parametrize(
    "period, today, expected",
    [
        pytest.param((D(2026, 9, 1), D(2026, 9, 30)), D(2026, 10, 23), (D(2026, 8, 1), D(2026, 8, 31)), id="вересень -> серпень 1-31"),
        pytest.param((D(2026, 10, 1), D(2026, 10, 31)), D(2026, 10, 23), (D(2026, 9, 1), D(2026, 9, 23)), id="поточний місяць до сьогодні"),
        pytest.param((D(2026, 3, 1), D(2026, 3, 31)), D(2026, 3, 30), (D(2026, 2, 1), D(2026, 2, 28)), id="30 березня -> весь лютий"),
        pytest.param((D(2026, 1, 1), D(2026, 2, 28)), D(2026, 10, 23), (D(2025, 11, 1), D(2025, 12, 31)), id="два місяці"),
        pytest.param((D(2026, 9, 10), D(2026, 9, 19)), D(2026, 10, 23), (D(2026, 8, 31), D(2026, 9, 9)), id="довільні 10 днів"),
    ],
)
def test_previous_period(period, today, expected):
    assert previous_period(*period, today) == expected


async def test_previous_period_keeps_amount_filters(db, monkeypatch, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    monkeypatch.setattr("app.tools.local_today", lambda: D(2026, 10, 23))
    aug = datetime.datetime(2026, 8, 1, 10, tzinfo=datetime.timezone.utc)
    db.add_all(
        [
            Transaction(user_id=owner, amount=-1500, category="покупки", spent_at=WHEN),
            Transaction(user_id=owner, amount=-2000, category="покупки", spent_at=aug),
            # Дрібна витрата не проходить min_amount і не має потрапити в порівняння.
            Transaction(user_id=owner, amount=-50, category="їжа", spent_at=aug),
        ]
    )
    await db.commit()

    outcome = await query_transactions(db, owner, "sum", date_from="2026-09-01", date_to="2026-09-30", min_amount=1000)

    previous = outcome.payload["previous_period"]
    # 1 серпня теж входить: вересень порівнюється з цілим серпнем.
    assert (previous["from"], previous["to"]) == ("2026-08-01", "2026-08-31")
    assert previous["expenses"] == 2000


async def test_current_month_is_cut_at_today(db, monkeypatch, alice):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    monkeypatch.setattr("app.tools.local_today", lambda: D(2026, 10, 10))
    db.add(Transaction(user_id=owner, amount=-500, category="їжа", spent_at=datetime.datetime(2026, 10, 5, 10, tzinfo=datetime.timezone.utc)))
    await db.commit()

    outcome = await query_transactions(db, owner, "sum", date_from="2026-10-01", date_to="2026-10-31")

    assert outcome.payload["days_in_period"] == 10
    assert outcome.payload["average_per_day"] == 50
    previous = outcome.payload["previous_period"]
    assert (previous["from"], previous["to"]) == ("2026-09-01", "2026-09-10")


async def test_out_of_range_date_from_model_is_an_argument_error(db, alice):
    from app.tools import ToolArgumentError

    _, user_id = alice
    with pytest.raises(ToolArgumentError):
        await query_transactions(db, uuid.UUID(user_id), "sum", date_from="0001-01-01", date_to="2026-01-31")


# --- семантичний пошук ---


def test_query_is_split_into_alternatives():
    assert _alternatives("витрати через стрес чи втому") == [["стрес"], ["втому"]]
    assert _alternatives("таксі, кафе або кава") == [["таксі"], ["кафе"], ["кава"]]
    assert _alternatives("витрати на подарунки друзям") == [["подарун", "друзя"]]


async def test_keyword_boosts_but_does_not_bypass_threshold(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    cosmetics = await add_note(db, owner, "Зайшла в магазин косметики, трохи щоб зняти стрес", 0.27)
    await add_note(db, owner, "Обід у кафе з друзями", 0.32)
    await add_note(db, owner, "Велика закупка продуктів", 0.45)

    stress = await semantic_search(db, owner, "витрати через стрес чи втому")
    assert [h.transaction.id for h in stress] == [cosmetics.id]

    # Збіглась лише одна основа з двох — бонусу замало, щоб пройти поріг.
    assert await semantic_search(db, owner, "витрати на подарунки друзям") == []


async def test_single_word_query(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    cosmetics = await add_note(db, owner, "Косметика, щоб зняти стрес", 0.27)
    # 0.60 без збігу слова — нижче за поріг для одного слова.
    await add_note(db, owner, "Varus", 0.60)

    hits = await semantic_search(db, owner, "стрес")
    assert [h.transaction.id for h in hits] == [cosmetics.id]


async def test_ranking_by_boosted_score(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    plain = await add_note(db, owner, "Шоколадка після пари", 0.70)
    boosted = await add_note(db, owner, "Заїла стрес перед дедлайном", 0.60)

    hits = await semantic_search(db, owner, "витрати через стрес")
    assert [h.transaction.id for h in hits] == [boosted.id, plain.id]
    assert hits[0].score == pytest.approx(0.90)


async def test_date_filter_applies_before_limit(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    august = datetime.datetime(2026, 8, 10, 12, tzinfo=datetime.timezone.utc)
    for _ in range(3):
        await add_note(db, owner, "Заїла стрес", 0.80, when=august)
    september = await add_note(db, owner, "Стрес перед сесією", 0.55)

    hits = await semantic_search(
        db, owner, "витрати через стрес", top_k=1, date_from=D(2026, 9, 1), date_to=D(2026, 9, 30)
    )
    assert [h.transaction.id for h in hits] == [september.id]


# --- гібрид і період у RAG ---


async def test_hybrid_sums_every_match_not_only_the_list(db, alice, fake_embedding):
    """Сума й кількість — по всіх записах вище порога, а не по показаних."""
    _, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all(
        [
            Transaction(
                user_id=owner, amount=-(i + 1), category="кафе", spent_at=WHEN, note="Кава з собою", embedding=vector(0.8)
            )
            for i in range(250)
        ]
    )
    await db.commit()

    outcome = await hybrid_search_and_sum(db, owner, "кава з собою")

    assert outcome.payload["total"] == sum(range(1, 251))
    assert outcome.payload["count"] == 250
    assert outcome.payload["shown"] == LIST_LIMIT
    assert outcome.payload["truncated"] is True
    assert len(outcome.transactions) == LIST_LIMIT


async def test_hybrid_without_truncation_has_no_flag(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    for amount in (-100, -250):
        await add_note(db, owner, "Кава з собою", 0.8, amount=amount)
    # Нижче порога — не входить ні в суму, ні в перелік.
    await add_note(db, owner, "Велика закупка продуктів", 0.3, amount=-900)

    outcome = await hybrid_search_and_sum(db, owner, "кава з собою")

    assert outcome.payload["total"] == 350
    assert outcome.payload["count"] == outcome.payload["shown"] == 2
    assert "truncated" not in outcome.payload


async def test_semantic_search_notes_respects_period(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    september = await add_note(db, owner, "Кава з собою", 0.8)
    october = await add_note(
        db, owner, "Кава з собою", 0.8, when=datetime.datetime(2026, 10, 10, 12, tzinfo=datetime.timezone.utc)
    )

    outcome = await semantic_search_notes(db, owner, "кава з собою", date_from="2026-10-01", date_to="2026-10-31")
    assert [t.id for t in outcome.transactions] == [october.id]

    # null від моделі — означає «без обмеження періодом».
    everything = await semantic_search_notes(db, owner, "кава з собою", date_from=None, date_to=None)
    assert {t.id for t in everything.transactions} == {september.id, october.id}


def test_semantic_search_schema_accepts_period():
    schema = next(s for s in tool_schemas() if s["function"]["name"] == "semantic_search_notes")
    properties = schema["function"]["parameters"]["properties"]
    assert properties["date_from"]["type"] == ["string", "null"]
    assert properties["date_to"]["type"] == ["string", "null"]


async def test_keyword_bonus_can_be_switched_off_for_evaluation(db, alice, fake_embedding):
    _, user_id = alice
    owner = uuid.UUID(user_id)
    cosmetics = await add_note(db, owner, "Зайшла в магазин косметики, трохи щоб зняти стрес", 0.27)

    with_bonus = await semantic_search(db, owner, "витрати через стрес")
    vector_only = await semantic_search(db, owner, "витрати через стрес", use_keywords=False)
    assert [h.transaction.id for h in with_bonus] == [cosmetics.id]
    assert vector_only == []
