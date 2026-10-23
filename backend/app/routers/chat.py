"""AI-чат: маршрутизація запиту між SQL, RAG і гібридом.

Пайплайн на один запит:
  1. модель отримує запит і опис інструментів та обирає, що викликати;
  2. інструмент виконується локально (SQL / векторний пошук);
  3. модель отримує результат і формулює відповідь.

Числа рахує база, модель лише пояснює — тому відповідь не залежить від її
арифметики.
"""

import json
import re
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.llm import LLMUnavailable, chat_completion, is_configured
from app.models import ChatMessage, Transaction, User
from app.schemas import ChatHistory, ChatRequest, ChatResponse
from app.tools import HANDLERS, ToolArgumentError, ToolOutcome, system_prompt, tool_schemas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

# Скільки останніх повідомлень історії передаємо моделі.
HISTORY_LIMIT = 10


@router.get("/status", summary="Чи налаштований AI-чат")
async def chat_status() -> dict:
    """Дає інтерфейсу зрозуміти, вмикати поле вводу чи ні."""
    return {"enabled": is_configured()}


@router.post("/", response_model=ChatResponse, summary="Запит до AI-асистента")
async def chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI-асистент не налаштований: не задано ключ LLM",
        )

    messages = [{"role": "system", "content": system_prompt()}]
    for item in payload.history[-HISTORY_LIMIT:]:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": payload.message})

    started = time.perf_counter()
    try:
        first = await chat_completion(messages, tools=tool_schemas())
    except LLMUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    calls = first.get("tool_calls") or []
    if not calls:
        # Модель вирішила, що інструмент не потрібен (вітання, уточнення).
        reply = _response(first.get("content") or "", None, [], started)
        return await _remember(db, user.id, payload.message, reply)

    messages.append(first)
    # Модель може зробити кілька викликів за раз. Запамʼятовуємо перший
    # успішний: раніше зберігався лише останній, і якщо він падав, інтерфейс
    # показував назву одного інструмента поруч із записами від іншого.
    outcome: ToolOutcome | None = None
    outcome_tool = ""
    seen_transactions: list = []

    for call in calls:
        tool_name = call["function"]["name"]
        handler = HANDLERS.get(tool_name)
        if handler is None:
            result = {"error": f"Невідомий інструмент {tool_name}"}
        else:
            try:
                arguments = json.loads(call["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                arguments = {}
            try:
                current = await handler(db, user.id, **arguments)
                result = current.payload
                if outcome is None:
                    outcome, outcome_tool = current, tool_name
                seen_transactions.extend(current.transactions)
            except ToolArgumentError as exc:
                # Зрозуміла проблема з аргументом — текст піде моделі, і вона
                # пояснить користувачу, що саме не так.
                result = {"error": str(exc)}
            except Exception:
                # Будь-яка інша помилка інструмента не має валити весь запит:
                # модель отримує позначку про збій і відповідає словами.
                logger.exception("Інструмент %s впав на аргументах %s", tool_name, arguments)
                result = {"error": "Не вдалося виконати запит до даних"}

        messages.append(
            {
                "role": "tool",
                "tool_call_id": call["id"],
                "name": tool_name,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            }
        )

    try:
        final = await chat_completion(messages)
    except LLMUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    reply = _response(
        final.get("content") or "",
        (outcome_tool, outcome.kind) if outcome else None,
        seen_transactions,
        started,
    )
    return await _remember(db, user.id, payload.message, reply)


# Скільки останніх повідомлень віддаємо при відкритті чату.
STORED_HISTORY_LIMIT = 100


@router.get("/history", response_model=ChatHistory, summary="Збережена розмова")
async def chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatHistory:
    """Останні повідомлення розмови разом зі знайденими під ними записами."""
    rows = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.user_id == user.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(STORED_HISTORY_LIMIT)
        )
    ).scalars().all()
    rows = list(reversed(rows))

    wanted = {
        tid for row in rows if row.tool_call for tid in row.tool_call.get("matched_transaction_ids", [])
    }
    by_id = {}
    if wanted:
        found = await db.execute(
            select(Transaction).where(
                Transaction.user_id == user.id,
                Transaction.id.in_([uuid.UUID(tid) for tid in wanted]),
            )
        )
        by_id = {str(t.id): t for t in found.scalars().all()}

    transactions = {}
    for row in rows:
        ids = row.tool_call.get("matched_transaction_ids", []) if row.tool_call else []
        items = [by_id[tid] for tid in ids if tid in by_id]
        if items:
            transactions[str(row.id)] = items

    return ChatHistory(
        messages=[
            {
                "id": str(row.id),
                "role": row.role,
                "content": row.content,
                "timestamp": row.created_at,
                "tool_call": row.tool_call,
            }
            for row in rows
        ],
        transactions=transactions,
    )


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT, summary="Почати розмову заново")
async def clear_chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    await db.execute(delete(ChatMessage).where(ChatMessage.user_id == user.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _remember(db: AsyncSession, user_id: uuid.UUID, question: str, reply: ChatResponse) -> ChatResponse:
    """Зберігає запит і відповідь, щоб розмова пережила повторне відкриття.

    Пишемо лише вдалу пару: якщо модель не відповіла, у історії не лишається
    питання без відповіді.
    """
    answer = reply.message
    # Обидва рядки пишуться в одній транзакції, а now() у ній однаковий —
    # питання ставимо на мить раніше, щоб порядок у розмові не плутався.
    db.add(
        ChatMessage(
            user_id=user_id,
            role="user",
            content=question,
            created_at=answer.timestamp - timedelta(milliseconds=1),
        )
    )
    db.add(
        ChatMessage(
            id=uuid.UUID(answer.id),
            user_id=user_id,
            role="assistant",
            content=answer.content,
            tool_call=answer.tool_call.model_dump() if answer.tool_call else None,
            created_at=answer.timestamp,
        )
    )
    await db.commit()
    return reply


_BOLD = re.compile(r"\*{1,3}(.+?)\*{1,3}", re.DOTALL)
_UNDERLINE = re.compile(r"__(.+?)__", re.DOTALL)
_BULLET = re.compile(r"^[ \t]*[-*+•]\s+", re.MULTILINE)
_HEADING = re.compile(r"^[ \t]*#{1,6}\s*", re.MULTILINE)
_BLANKS = re.compile(r"\n{3,}")


def _plain_text(content: str) -> str:
    """Прибирає markdown із відповіді моделі.

    Інтерфейс показує текст як є, тож зірочки й решітки видно користувачу.
    Промпт просить писати без розмітки, але модель періодично її вставляє —
    покладатися лише на прохання не можна.
    """
    content = _BOLD.sub(r"\1", content)
    content = _UNDERLINE.sub(r"\1", content)
    content = _HEADING.sub("", content)
    content = _BULLET.sub("• ", content)
    return _BLANKS.sub("\n\n", content).strip()


def _response(content: str, tool: tuple[str, str] | None, transactions: list, started: float) -> ChatResponse:
    content = _plain_text(content)
    duration_ms = int((time.perf_counter() - started) * 1000)
    # Та сама нотатка трапляється в кількох транзакціях; для показу досить
    # перших, але порахована сума стосується всіх знайдених.
    shown = transactions[:20]
    return ChatResponse(
        message={
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": content,
            "timestamp": datetime.now(timezone.utc),
            "tool_call": None
            if tool is None
            else {
                "name": tool[0],
                "kind": tool[1],
                "duration_ms": duration_ms,
                "matched_transaction_ids": [str(t.id) for t in shown],
            },
        },
        transactions=shown,
    )
