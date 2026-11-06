"""Клієнт LLM: ключ із LLM_API_KEY чи старого GROQ_API_KEY, локальна модель без ключа."""

import httpx
import pytest

from app import llm
from app.database import settings

REAL_CLIENT = httpx.AsyncClient


@pytest.fixture
def provider(monkeypatch):
    """Підмінений провайдер: запамʼятовує запити й відповідає порожнім повідомленням."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "ок"}}]})

    monkeypatch.setattr(
        llm.httpx, "AsyncClient", lambda **kwargs: REAL_CLIENT(transport=httpx.MockTransport(handler), **kwargs)
    )
    for name in ("LLM_API_KEY", "GROQ_API_KEY"):
        monkeypatch.setattr(settings, name, "")
    monkeypatch.setattr(settings, "LLM_BASE_URL", "https://api.groq.com/openai/v1")
    return seen


async def test_new_key_name_is_used(provider, monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "new-key")
    assert llm.is_configured()
    await llm.chat_completion([{"role": "user", "content": "привіт"}])
    assert provider[0].headers["authorization"] == "Bearer new-key"


async def test_old_groq_key_name_still_works(provider, monkeypatch):
    """Старі .env з GROQ_API_KEY мають працювати без змін."""
    monkeypatch.setattr(settings, "GROQ_API_KEY", "old-key")
    assert llm.is_configured()
    await llm.chat_completion([{"role": "user", "content": "привіт"}])
    assert provider[0].headers["authorization"] == "Bearer old-key"


@pytest.mark.parametrize(
    "base_url",
    ["http://localhost:11434/v1", "http://127.0.0.1:11434/v1", "http://[::1]:11434/v1"],
)
async def test_local_model_needs_no_key(provider, monkeypatch, base_url):
    """Ollama на цьому ж комп'ютері ключа не має — і не потребує."""
    monkeypatch.setattr(settings, "LLM_BASE_URL", base_url)
    assert llm.is_configured()
    await llm.chat_completion([{"role": "user", "content": "привіт"}])
    assert str(provider[0].url).startswith(base_url)
    assert "authorization" not in provider[0].headers


async def test_remote_provider_without_key_is_not_configured(provider):
    assert not llm.is_configured()
    with pytest.raises(llm.LLMUnavailable, match="LLM_API_KEY"):
        await llm.chat_completion([{"role": "user", "content": "привіт"}])
    assert provider == []
