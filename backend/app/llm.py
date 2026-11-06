"""Клієнт до LLM через OpenAI-сумісний API.

Провайдер задається адресою: Groq у хмарі або Ollama на цьому ж комп'ютері.
Код однаковий — різниться лише LLM_BASE_URL, ключ і модель.
"""

import asyncio
import logging
from typing import Any

from urllib.parse import urlsplit

import httpx

from app.database import settings

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(60.0, connect=10.0)
# Локальна модель на ноутбуці думає довше за хмару: на довгому промпті з
# описом інструментів відповідь може йти кілька хвилин.
LOCAL_TIMEOUT = httpx.Timeout(300.0, connect=5.0)
RATE_LIMIT_RETRIES = 3


class LLMUnavailable(RuntimeError):
    """Ключ не заданий або провайдер не відповів."""


_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _api_key() -> str:
    return settings.LLM_API_KEY or settings.GROQ_API_KEY


def is_local() -> bool:
    """Модель на цьому ж комп'ютері (Ollama): ключа немає, дані нікуди не йдуть."""
    return urlsplit(settings.LLM_BASE_URL).hostname in _LOCAL_HOSTS


def is_configured() -> bool:
    return bool(_api_key()) or is_local()


async def chat_completion(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
    tool_choice: str | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Один виклик моделі. Повертає об'єкт message з відповіді.

    `model` — для порівняння моделей в eval; застосунок завжди бере LLM_MODEL.
    """
    if not is_configured():
        raise LLMUnavailable("Не задано ключ LLM (LLM_API_KEY)")

    body: dict[str, Any] = {
        "model": model or settings.LLM_MODEL,
        "messages": messages,
        # 0 — щоб на однаковий запит модель стабільно обирала той самий
        # інструмент: інакше оцінку маршрутизації не можна відтворити.
        "temperature": 0,
    }
    if tools:
        body["tools"] = tools
        # Розбір фрази в чернетку примушує конкретний інструмент: текстова
        # відповідь там нічого не дає.
        body["tool_choice"] = tool_choice or "auto"

    # Без власного User-Agent Cloudflare перед Groq віддає 403.
    headers = {"User-Agent": "krona/0.1"}
    # Локальній моделі ключ не потрібен — і не варто його кудись надсилати.
    if _api_key():
        headers["Authorization"] = f"Bearer {_api_key()}"

    async with httpx.AsyncClient(timeout=LOCAL_TIMEOUT if is_local() else TIMEOUT) as client:
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            try:
                response = await client.post(
                    f"{settings.LLM_BASE_URL}/chat/completions", json=body, headers=headers
                )
            except httpx.HTTPError as exc:
                raise LLMUnavailable("Не вдалося звʼязатися з сервісом LLM") from exc

            # На безкоштовному тарифі ліміт 30 запитів/хв; чекаємо й пробуємо ще.
            if response.status_code == 429 and attempt < RATE_LIMIT_RETRIES:
                await asyncio.sleep(_retry_delay(response, attempt))
                continue

            if response.status_code == 429:
                raise LLMUnavailable("Перевищено ліміт запитів до LLM, спробуйте за хвилину")
            if response.status_code != 200:
                logger.error("LLM відповів %s: %s", response.status_code, response.text[:500])
                raise LLMUnavailable(f"Сервіс LLM повернув помилку ({response.status_code})")

            return response.json()["choices"][0]["message"]

    raise LLMUnavailable("Сервіс LLM недоступний")


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    """Скільки чекати перед повтором: за заголовком провайдера або з запасом."""
    header = response.headers.get("retry-after")
    if header:
        try:
            return min(float(header), 30.0)
        except ValueError:
            pass
    return 2.0 * (attempt + 1)
