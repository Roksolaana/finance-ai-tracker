"""Клієнт до LLM (Groq через OpenAI-сумісний API)."""

import asyncio
import logging
from typing import Any

import httpx

from app.database import settings

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(60.0, connect=10.0)
RATE_LIMIT_RETRIES = 3


class LLMUnavailable(RuntimeError):
    """Ключ не заданий або провайдер не відповів."""


def is_configured() -> bool:
    return bool(settings.GROQ_API_KEY)


async def chat_completion(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Один виклик моделі. Повертає об'єкт message з відповіді."""
    if not is_configured():
        raise LLMUnavailable("Не задано GROQ_API_KEY")

    body: dict[str, Any] = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        # 0 — щоб на однаковий запит модель стабільно обирала той самий
        # інструмент: інакше оцінку маршрутизації не можна відтворити.
        "temperature": 0,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        # Без власного User-Agent Cloudflare перед Groq віддає 403.
        "User-Agent": "krona/0.1",
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
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
