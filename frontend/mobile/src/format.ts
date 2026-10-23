import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";
import { CATEGORY_COLORS, MONTH_NAMES, dayKey, type TransactionCategory } from "@finance/shared";
import { theme } from "@/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function money(value: number): string {
  const abs = Math.abs(value);
  const digits = Number.isInteger(abs) ? 0 : 2;
  return `${abs.toLocaleString("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₴`;
}

/** Сума зі знаком: «−120 ₴» для витрати, «+500 ₴» для доходу. */
export function signedMoney(value: number): string {
  return `${value < 0 ? "−" : "+"}${money(value)}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function dayTitle(key: string): string {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return "Сьогодні";
  if (key === yesterday) return "Вчора";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const CATEGORY_ICONS: Record<TransactionCategory, IconName> = {
  "їжа": "basket-outline",
  "кафе": "cafe-outline",
  "транспорт": "bus-outline",
  "розваги": "game-controller-outline",
  "комунальні": "home-outline",
  "підписки": "repeat-outline",
  "здоров'я": "medkit-outline",
  "покупки": "bag-handle-outline",
  "дохід": "wallet-outline",
  "інше": "ellipsis-horizontal",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category as TransactionCategory] ?? theme.muted;
}

export function categoryIcon(category: string): IconName {
  return CATEGORY_ICONS[category as TransactionCategory] ?? "ellipsis-horizontal";
}
