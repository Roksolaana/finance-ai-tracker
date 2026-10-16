import type { TransactionCategory } from "./types";

export const API_URL = "http://localhost:8000/api/v1";

export const CATEGORIES: TransactionCategory[] = [
  "їжа",
  "кафе",
  "транспорт",
  "розваги",
  "комунальні",
  "підписки",
  "здоров'я",
  "покупки",
  "дохід",
  "інше",
];

export const EXPENSE_CATEGORIES: TransactionCategory[] = CATEGORIES.filter((c) => c !== "дохід");

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  "їжа": "#6B7F2E",
  "кафе": "#A0652B",
  "транспорт": "#2F7F8F",
  "розваги": "#D1592A",
  "комунальні": "#8E4B6E",
  "підписки": "#C79400",
  "здоров'я": "#5B8C7A",
  "покупки": "#B5677D",
  "дохід": "#55643B",
  "інше": "#8A8A7A",
};

export const BUDGET_LIMITS: Partial<Record<TransactionCategory, number>> = {
  "їжа": 6000,
  "кафе": 2500,
  "транспорт": 1200,
  "розваги": 2000,
  "покупки": 3000,
};

export const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

/** Відповідає ISO-нумерації з бекенду: індекс 0 — понеділок. */
export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export const MONTH_NAMES_SHORT = [
  "січ", "лют", "бер", "кві", "тра", "чер",
  "лип", "сер", "вер", "жов", "лис", "гру",
];
