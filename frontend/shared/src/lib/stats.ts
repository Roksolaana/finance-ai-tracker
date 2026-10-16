import type { Transaction, TransactionCategory } from "../types";

// Агрегація (суми, категорії, динаміка, порівняння періодів) живе на бекенді
// в `GET /stats/*`. Тут лишились тільки хелпери для роботи з ключем місяця
// та локальною нарізкою вже завантаженого списку для показу.

const pad = (n: number) => String(n).padStart(2, "0");

export type BudgetLimits = Partial<Record<TransactionCategory, number>>;

export function monthKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function dayKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${monthKey(d)}-${pad(d.getDate())}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function filterByMonth(transactions: Transaction[], key: string): Transaction[] {
  return transactions.filter((t) => monthKey(t.spent_at) === key);
}
