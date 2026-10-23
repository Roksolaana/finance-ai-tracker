import { MONTH_NAMES, MONTH_NAMES_GENITIVE, MONTH_NAMES_SHORT } from "@finance/shared";

export const CHART = {
  income: "#A9B98A",
  expense: "#3B4726",
  olive: "#5A6B3A",
  grid: "#F0EDE2",
  // Те саме, що --color-muted: Recharts не читає CSS-змінні в tick.fill.
  axis: "#696C58",
};

export function formatMoney(value: number, { sign = false, decimals }: { sign?: boolean; decimals?: number } = {}) {
  const absolute = Math.abs(value);
  // Копійки показуємо лише коли вони справді є. Фіксовані 0 знаків
  // округлювали суми на вигляд, і підсумки розходилися з деталями.
  const fraction = decimals ?? (Number.isInteger(absolute) ? 0 : 2);
  const formatted = absolute.toLocaleString("uk-UA", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  });
  const prefix = value < 0 ? "−" : sign && value > 0 ? "+" : "";
  return `${prefix}${formatted} ₴`;
}

/**
 * Форматує дату-ключ «YYYY-MM-DD» як день і місяць.
 *
 * `new Date("2026-10-03")` парситься як UTC-полуніч, тому в поясах західніше
 * UTC показувало б попередній день — тут дата збирається як локальна.
 */
export function formatDayLabel(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

export function formatCompact(value: number) {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}к`;
  return String(Math.round(value));
}

export function formatMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** «2026-10» → «жовтня 2026» — для зворотів на кшталт «до жовтня 2026 включно». */
export function formatMonthGenitive(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES_GENITIVE[m - 1]} ${y}`;
}

export function formatMonthShort(key: string) {
  const [, m] = key.split("-").map(Number);
  return MONTH_NAMES_SHORT[m - 1];
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("uk-UA")}%`;
}
