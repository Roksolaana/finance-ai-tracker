"""Оцінка асистента: зафіксоване «сьогодні», підрахунок метрик, набори кейсів."""

import datetime
import uuid

from app.models import BudgetHistory, Transaction
from app.timeutils import frozen_today, local_today
from app.tools import check_budgets, query_transactions, system_prompt, tool_schemas

D = datetime.date


async def test_frozen_today_reaches_prompt_and_tools(db, alice):
    """Модель рахує «минулий місяць» від дати з промпту, а інструменти — від local_today.

    Якщо зафіксувати лише одне з двох, очікувані аргументи розійдуться з
    тим, що модель вважає сьогоднішнім днем.
    """
    _, user_id = alice
    owner = uuid.UUID(user_id)
    db.add_all(
        [
            BudgetHistory(user_id=owner, category="кафе", valid_from=D(2026, 9, 1), monthly_limit=1000),
            Transaction(
                user_id=owner,
                amount=-300,
                category="кафе",
                spent_at=datetime.datetime(2026, 9, 5, 12, tzinfo=datetime.timezone.utc),
            ),
        ]
    )
    await db.commit()

    with frozen_today(D(2026, 9, 10)):
        assert local_today() == D(2026, 9, 10)
        assert "Сьогодні 2026-09-10." in system_prompt()
        # Поточний місяць інструмента — вересень зафіксованої дати.
        assert (await check_budgets(db, owner)).payload["month"] == "2026-09"
        # Незавершений місяць ріжеться зафіксованим днем.
        outcome = await query_transactions(db, owner, "sum", date_from="2026-09-01", date_to="2026-09-30")
        assert outcome.payload["days_in_period"] == 10

    assert local_today() != D(2026, 9, 10)


# --- набір запитів і підрахунок метрик ---


def test_case_set_is_balanced_and_consistent():
    from collections import Counter

    from eval.cases import CASES
    from eval.scoring import PATHS, TOOL_PATH

    assert len(CASES) >= 60
    assert len({c.question for c in CASES}) == len(CASES), "запити не мають повторюватись"
    by_primary = Counter(c.primary for c in CASES)
    assert by_primary["budgets"] >= 5
    # Жоден тип не домінує: інакше точність показувала б лише один сценарій.
    assert max(by_primary.values()) <= 3 * min(by_primary.values())

    schemas = {s["function"]["name"]: s["function"]["parameters"]["properties"] for s in tool_schemas()}
    tool_for = {path: tool for tool, path in TOOL_PATH.items()}
    for item in CASES:
        assert item.primary in PATHS and item.also <= set(PATHS), item.question
        if item.primary == "none":
            assert not item.expected_args, item.question
            continue
        allowed = schemas[tool_for[item.primary]]
        assert set(item.expected_args) <= set(allowed), item.question
        for key in ("date_from", "date_to"):
            for value in _options(item.expected_args.get(key)):
                datetime.date.fromisoformat(value)


def _options(value):
    if value is None:
        return []
    return list(value) if isinstance(value, tuple) else [value]


def test_args_mismatch_is_partial_and_accepts_alternatives():
    from eval.scoring import args_mismatch

    expected = {"aggregation": "sum", "date_to": ("2026-10-16", "2026-10-31"), "category": None}
    # Зайві аргументи (tx_type) не заважають, null рівноцінний відсутності.
    assert args_mismatch(expected, {"aggregation": "sum", "date_to": "2026-10-31", "tx_type": "expense"}) == []
    assert args_mismatch(expected, {"aggregation": "sum", "date_to": "2026-10-16", "category": None}) == []
    assert args_mismatch(expected, {"aggregation": "list", "date_to": "2026-10-20", "category": "кафе"}) == [
        "aggregation",
        "date_to",
        "category",
    ]
    assert args_mismatch({"min_amount": 1000}, {"min_amount": 1000.0}) == []


def test_summary_counts_failed_calls_as_wrong():
    from eval.scoring import summarise

    rows = [
        {"soft_ok": True, "strict_ok": True, "args_ok": True, "faithful": True, "seconds": 1.0},
        {"soft_ok": True, "strict_ok": False, "args_ok": None, "faithful": False, "seconds": 3.0},
        # Виклик моделі впав: не вірно, без аргументів і без відповіді.
        {"soft_ok": False, "strict_ok": False, "args_ok": False, "faithful": None, "seconds": None},
    ]
    summary = summarise(rows)
    assert (summary.total, summary.soft, summary.strict) == (3, 2, 1)
    assert (summary.args_total, summary.args_ok) == (2, 1)
    assert (summary.answers_total, summary.faithful) == (2, 1)
    assert summary.seconds == 2.0
    assert summary.median_seconds == 2.0


# --- фікстура й оцінка пошуку ---


def test_fixture_file_matches_generator():
    """У репозиторії саме той файл, який дає генератор: дані можна відтворити."""
    import json

    from eval.make_fixture import FIXTURE, build

    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == build()


def test_fixture_is_valid_and_labels_point_to_real_notes():
    from collections import Counter

    from app.constants import CATEGORIES, INCOME_CATEGORY
    from eval.cases import TODAY
    from eval.evaldb import load_fixture
    from eval.retrieval_cases import CASES

    data = load_fixture()
    notes = {row["note"] for row in data["transactions"]}
    for row in data["transactions"]:
        assert row["category"] in CATEGORIES
        assert (row["amount"] > 0) == (row["category"] == INCOME_CATEGORY), row
        assert datetime.datetime.fromisoformat(row["spent_at"]).date() <= TODAY

    for item in CASES:
        missing = item.relevant - notes
        assert not missing, (item.query, missing)
    splits = Counter(item.split for item in CASES)
    assert splits["dev"] >= 18 and splits["test"] >= 18
    # Запити без відповіді є в обох частинах: поріг має вміти промовчати.
    assert all(any(not c.relevant for c in CASES if c.split == s) for s in ("dev", "test"))


async def test_fixture_loads_into_database(sessionmaker):
    from sqlalchemy import func, select

    from eval.evaldb import fill, load_fixture

    data = load_fixture()
    async with sessionmaker() as session:
        user_id = await fill(session, data, embed_texts=lambda texts: [[1.0] + [0.0] * 383 for _ in texts])
        count = (await session.execute(select(func.count()).where(Transaction.user_id == user_id))).scalar_one()
        assert count == len(data["transactions"])
        # Історія лімітів доїхала: на розваги у вересні й жовтні різні ліміти.
        september = await check_budgets(session, user_id, "2026-09")
        october = await check_budgets(session, user_id, "2026-10")
        limit = lambda o: {r["category"]: r["limit"] for r in o.payload["budgets"]}["розваги"]
        assert (limit(september), limit(october)) == (800, 1000)


def test_retrieval_scores():
    from eval.scoring import retrieval_scores

    assert retrieval_scores({"a", "b"}, {"a", "c"}) == (0.5, 0.5, 0.5)
    assert retrieval_scores(set(), set()) == (1.0, 1.0, 1.0)
    assert retrieval_scores({"a"}, set()) == (0.0, 1.0, 0.0)
    assert retrieval_scores(set(), {"a"}) == (0.0, 0.0, 0.0)


async def test_routing_run_scores_a_full_answer(sessionmaker, alice, monkeypatch):
    """Повний шлях кейсу без справжньої моделі: виклик інструмента, відповідь, метрики."""
    import json

    from eval import run_routing
    from eval.cases import EvalCase

    _, user_id = alice
    owner = uuid.UUID(user_id)
    async with sessionmaker() as session:
        session.add(
            Transaction(
                user_id=owner,
                amount=-1234,
                category="їжа",
                spent_at=datetime.datetime(2026, 9, 10, 12, tzinfo=datetime.timezone.utc),
            )
        )
        await session.commit()

    async def fake_completion(messages, tools=None, model=None):
        if tools:
            arguments = {"aggregation": "sum", "date_from": "2026-09-01", "date_to": "2026-09-30"}
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {"id": "c1", "type": "function",
                     "function": {"name": "query_transactions", "arguments": json.dumps(arguments)}}
                ],
            }
        # Друге число вигадане: у даних його немає.
        return {"role": "assistant", "content": "У вересні ви витратили 1 234 ₴, це на 7% більше, ніж зазвичай."}

    monkeypatch.setattr("app.llm.chat_completion", fake_completion)
    monkeypatch.setattr(run_routing, "chat_completion", fake_completion)

    item = EvalCase("Скільки я витратила у вересні?", "sql", expected_args={"aggregation": "sum", "date_from": "2026-09-01"})
    with frozen_today(D(2026, 10, 16)):
        raw = await run_routing.run_case(item, "fake", sessionmaker, owner)
    scored = run_routing.score(item, raw)

    assert raw["payloads"][0]["expenses"] == 1234
    assert scored["strict_ok"] and scored["soft_ok"] and scored["args_ok"]
    assert scored["faithful"] is False and scored["unsupported"] == ["7%"]

    # Інший інструмент — аргументи не зараховуються, навіть якщо збігаються.
    wrong = run_routing.score(item, raw | {"tool": "hybrid_search_and_sum"})
    assert (wrong["strict_ok"], wrong["args_ok"], wrong["mismatch"]) == (False, False, ["інший інструмент"])
