import { MONTH_NAMES, MONTH_NAMES_SHORT } from "@finance/shared";

export const CHART = {
  income: "#A9B98A",
  expense: "#3B4726",
  olive: "#5A6B3A",
  grid: "#F0EDE2",
  axis: "#80836F",
};

export function formatMoney(value: number, { sign = false, decimals = 0 } = {}) {
  const formatted = Math.abs(value).toLocaleString("uk-UA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = value < 0 ? "−" : sign && value > 0 ? "+" : "";
  return `${prefix}${formatted} ₴`;
}

export function formatCompact(value: number) {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}к`;
  return String(Math.round(value));
}

export function formatMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
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
