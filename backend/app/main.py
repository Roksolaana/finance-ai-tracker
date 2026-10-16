"""FastAPI entry point — ініціалізація застосунку та створення таблиць."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import engine
from app.migrate import upgrade_to_head
from app.routers import auth, budgets, stats, transactions

# Збірка десктоп-клієнта (frontend/desktop/dist) — віддається тим самим процесом,
# щоб фронтенд і бекенд працювали на одному порту.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "desktop" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: довести схему до останньої міграції. Shutdown: закрити пул."""
    # Alembic синхронний, тому виносимо його в окремий потік.
    await asyncio.to_thread(upgrade_to_head)
    yield
    await engine.dispose()


app = FastAPI(
    title="Krona API",
    description="Бекенд для обліку фінансів з гібридним SQL/RAG-пошуком",
    version="0.1.0",
    lifespan=lifespan,
)

# Застосунок однокористувацький і без cookie-автентифікації, тому запити
# дозволені з будь-якого джерела — це потрібно мобільному клієнту (Expo),
# який працює з іншого хоста в локальній мережі.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1")
app.include_router(budgets.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health_check():
    """Перевірка, що сервер живий."""
    return {"status": "ok"}


if FRONTEND_DIST.is_dir():
    # Монтується останнім — специфічні маршрути (/api/v1, /health) мають пріоритет.
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
