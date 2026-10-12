import type { TransactionCategory } from "./types";

export const API_URL = "http://localhost:8000/api/v1";

export const CATEGORIES: TransactionCategory[] = [
  "їжа",
  "транспорт",
  "розваги",
  "комунальні",
  "підписки",
  "дохід",
  "інше",
];

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  "їжа": "#6B7F2E",
  "транспорт": "#0088A3",
  "розваги": "#D1592A",
  "комунальні": "#9C3D73",
  "підписки": "#C79400",
  "дохід": "#55643B",
  "інше": "#C79400",
};
