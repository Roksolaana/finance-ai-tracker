"""Обмеження частоти запитів: ковзне вікно в памʼяті процесу.

Спільне для чату (запити до LLM) і входу (підбір пароля). Лічильники живуть
у памʼяті: застосунок працює одним процесом uvicorn, тож окремий Redis заради
цього зайвий. Після перезапуску лічильники обнуляються — для захисту від
зловживань це не страшно.
"""

import math
from collections import deque
from collections.abc import Callable, Hashable
from time import monotonic

from fastapi import HTTPException, status

# Ключі, які давно не трапляються, самі з памʼяті не зникають. Для входу
# ключ — це будь-який email, який хтось надіслав, тож без прибирання словник
# ріс би з кожним новим. Чистимо, лише коли їх назбиралось багато.
SWEEP_AFTER_KEYS = 10_000


class RateLimiter:
    """Скільки подій для ключа сталося за останні `window` секунд.

    Ліміт передається в кожен виклик, а не задається при створенні: так його
    можна змінити в налаштуваннях модуля без пересоздання лічильників.
    """

    def __init__(self, window: float, clock: Callable[[], float] = monotonic) -> None:
        self.window = window
        self._clock = clock
        self._events: dict[Hashable, deque[float]] = {}

    def _prune(self, key: Hashable, now: float) -> deque[float] | None:
        events = self._events.get(key)
        if events is None:
            return None
        while events and now - events[0] >= self.window:
            events.popleft()
        if not events:
            del self._events[key]
            return None
        return events

    def retry_after(self, key: Hashable, limit: int) -> int | None:
        """Через скільки секунд можна знову; None — ліміт ще не вичерпано."""
        now = self._clock()
        events = self._prune(key, now)
        if events is None or len(events) < limit:
            return None
        # Звільниться місце, коли найстаріша подія вийде з вікна.
        return max(1, math.ceil(self.window - (now - events[0])))

    def record(self, key: Hashable) -> None:
        now = self._clock()
        if len(self._events) >= SWEEP_AFTER_KEYS:
            for stale in list(self._events):
                self._prune(stale, now)
        self._events.setdefault(key, deque()).append(now)

    def reset(self, key: Hashable) -> None:
        self._events.pop(key, None)

    def clear(self) -> None:
        self._events.clear()


def too_many_requests(detail: str, retry_after: int) -> HTTPException:
    """429 з Retry-After, щоб клієнт знав, скільки чекати, а не повторював одразу."""
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )
