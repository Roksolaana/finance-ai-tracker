"""Початкова Alembic-міграція: таблиця expenses + HNSW-індекс для pgvector.

Цей файл виконується вручну: alembic upgrade head
Або автоматично через lifespan у main.py (Base.metadata.create_all).
HNSW-індекс додається окремо, бо SQLAlchemy create_all його не створює.
"""

-- Увімкнути розширення pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Створити таблицю expenses (якщо не існує)
CREATE TABLE IF NOT EXISTS expenses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount      NUMERIC(12, 2) NOT NULL,
    category    VARCHAR(100) NOT NULL,
    spent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    note        TEXT,
    embedding   vector(384),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Індекс на category для фільтрації
CREATE INDEX IF NOT EXISTS ix_expenses_category ON expenses (category);

-- HNSW-індекс для швидкого семантичного пошуку (cosine distance)
-- m=16, ef_construction=64 — збалансовані параметри для < 100k записів
CREATE INDEX IF NOT EXISTS ix_expenses_embedding_hnsw
ON expenses
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
