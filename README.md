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

## Мобільний застосунок

Той самий бекенд, але слухати він має всю локальну мережу, а не лише цей комп'ютер:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --reload

cd ../frontend/mobile
npx expo start --lan
```

Телефон має бути в тій самій Wi-Fi мережі. QR-код з термінала відкривається в Expo Go.
Якщо застосунок не бачить сервер, спершу відкрийте з телефона `http://<IP ноутбука>:8000/health`.

## Тести

Тести створюють окрему базу `finance_test` у тому ж контейнері й видаляють її в кінці,
тож робочі дані не зачіпаються. Docker має працювати.

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

## Схема БД

Схема описана Alembic-міграціями в `backend/migrations/versions/`. Застосунок
доводить її до останньої ревізії сам при старті, тому окремої команди не треба.
Застосувати вручну:

```bash
cd backend
python -c "from app.migrate import upgrade_to_head; upgrade_to_head()"
```
