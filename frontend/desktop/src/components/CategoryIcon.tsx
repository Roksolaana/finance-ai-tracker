import {
  Bus,
  Coffee,
  HeartPulse,
  House,
  Popcorn,
  Repeat,
  Shapes,
  ShoppingBag,
  ShoppingBasket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_COLORS, type TransactionCategory } from "@finance/shared";

const ICONS: Record<TransactionCategory, LucideIcon> = {
  "їжа": ShoppingBasket,
  "кафе": Coffee,
  "транспорт": Bus,
  "розваги": Popcorn,
  "комунальні": House,
  "підписки": Repeat,
  "здоров'я": HeartPulse,
  "покупки": ShoppingBag,
  "дохід": Wallet,
  "інше": Shapes,
};

export function CategoryIcon({ category, size = 36 }: { category: TransactionCategory; size?: number }) {
  // Категорія може прийти з бази незнайомою (запис створено через Swagger або
  // ще до введення валідації) — тоді показуємо вигляд «інше», а не падаємо.
  const Icon = ICONS[category] ?? ICONS["інше"];
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["інше"];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `${color}1A`, color }}
    >
      <Icon size={size * 0.47} strokeWidth={1.9} />
    </span>
  );
}
