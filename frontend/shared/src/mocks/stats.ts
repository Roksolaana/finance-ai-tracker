import type { DashboardStats } from "../types";

export const mockDashboardStats: DashboardStats = {
  balance: 42580,
  total_income: 61000,
  total_expenses: 18420.5,
  category_breakdown: [
    { category: "їжа", amount: 6258, percent: 34 },
    { category: "транспорт", amount: 3316, percent: 18 },
    { category: "розваги", amount: 2763, percent: 15 },
    { category: "комунальні", amount: 1658, percent: 9 },
    { category: "інше", amount: 4425, percent: 24 },
  ],
  cashflow: [
    { date: "2025-10-01", income: 6750, expense: 5250 },
    { date: "2025-10-08", income: 12000, expense: 9000 },
    { date: "2025-10-15", income: 9750, expense: 6000 },
    { date: "2025-10-22", income: 14250, expense: 12750 },
    { date: "2025-10-29", income: 7500, expense: 4500 },
  ],
  budgets: [
    { category: "їжа", limit: 8000, spent: 6258 },
    { category: "транспорт", limit: 3000, spent: 3316 },
    { category: "розваги", limit: 5000, spent: 2763 },
    { category: "комунальні", limit: 2000, spent: 1658 },
  ],
};
