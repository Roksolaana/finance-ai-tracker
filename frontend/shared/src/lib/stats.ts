import type { Transaction, TransactionCategory } from "../types";

// Агрегація (суми, категорії, динаміка, порівняння періодів) живе на бекенді
// в `GET /stats/*`. Тут лишились тільки хелпери для роботи з ключем місяця
// та локальною нарізкою вже завантаженого списку для показу.

const pad = (n: number) => String(n).padStart(2, "0");

export type BudgetLimits = Partial<Record<TransactionCategory, number>>;

/**
 * Місяць і день рахуються за київським часом — так само, як групує бекенд
 * (`APP_TIMEZONE`). За поясом пристрою запис о 01:30 першого числа на
 * телефоні з UTC потрапляв би в попередній місяць, і список розходився б
 * із підсумками сервера поруч.
 */
export const APP_TIME_ZONE = "Europe/Kyiv";

// null — платформа не знає часових поясів; тоді лишається пояс пристрою.
let zoneFormat: Intl.DateTimeFormat | null | undefined;

function calendarParts(d: Date): [number, number, number] {
  if (zoneFormat === undefined) {
    try {
      // en-CA дає дату як 2026-10-23 — її легко розібрати.
      zoneFormat = new Intl.DateTimeFormat("en-CA", {
        timeZone: APP_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      zoneFormat = null;
    }
  }
  const match = zoneFormat ? /(\d{4})\D(\d{2})\D(\d{2})/.exec(zoneFormat.format(d)) : null;
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

export function monthKey(date: string | Date): string {
  const [y, m] = calendarParts(typeof date === "string" ? new Date(date) : date);
  return `${y}-${pad(m)}`;
}

export function dayKey(date: string | Date): string {
  const [y, m, d] = calendarParts(typeof date === "string" ? new Date(date) : date);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Арифметика над ключем, без Date: опівніч за поясом пристрою могла б бути ще іншим днем у Києві. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Календарний зсув дня (UTC-дата лише як лічильник, тож переходи на літній час не заважають). */
export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function filterByMonth(transactions: Transaction[], key: string): Transaction[] {
  return transactions.filter((t) => monthKey(t.spent_at) === key);
}
