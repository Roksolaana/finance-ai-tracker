# Krona

Застосунок для обліку особистих фінансів з AI-асистентом.

## Запуск (фронтенд і бекенд на одному порту — 8000)

```bash
# 1. База даних (Docker Desktop має працювати)
cd backend
docker compose up -d

# 2. Збірка фронтенду (після кожної зміни в UI)
cd ../frontend/desktop
npm install
npm run build

# 3. Бекенд — віддає і API, і зібраний фронтенд
cd ../../backend
source .venv/Scripts/activate
uvicorn app.main:app --reload
```

- Застосунок: http://localhost:8000
- API: http://localhost:8000/api/v1/transactions/
- Swagger: http://localhost:8000/docs

Для розробки UI з hot-reload можна окремо запустити `npm run dev` у `frontend/desktop` (порт 5173).

## Схема БД

Схема описана Alembic-міграціями в `backend/migrations/versions/`. Застосунок
доводить її до останньої ревізії сам при старті, тому окремої команди не треба.
Застосувати вручну:

```bash
cd backend
python -c "from app.migrate import upgrade_to_head; upgrade_to_head()"
```
