"""FastAPI entry point — ініціалізація застосунку та створення таблиць."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.database import engine
from app.models import Base
from app.routers import expenses


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: створити розширення pgvector + таблиці. Shutdown: закрити пул."""
    async with engine.begin() as conn:
        # Увімкнути pgvector extension (idempotent)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Створити таблиці, яких ще нема
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="Finance Tracker API",
    description="Бекенд для обліку фінансів з гібридним SQL/RAG-пошуком",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(expenses.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health_check():
    """Перевірка, що сервер живий."""
    return {"status": "ok"}
