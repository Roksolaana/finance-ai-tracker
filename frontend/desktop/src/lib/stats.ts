import type {
  BudgetLimit,
  CashflowPoint,
  CategoryBreakdownEntry,
  DashboardStats,
  Transaction,
  TransactionCategory,
} from "@finance/shared";

const BUDGET_LIMITS: Partial<Record<TransactionCategory, number>> = {
  "їжа": 8000,
  "транспорт": 3000,
  "розваги": 5000,
  "комунальні": 2000,
};

export function computeDashboardStats(transactions: Transaction[]): DashboardStats {
  const incomeTx = transactions.filter((t) => t.amount > 0);
  const expenseTx = transactions.filter((t) => t.amount < 0);

  const total_income = incomeTx.reduce((sum, t) => sum + t.amount, 0);
  const total_expenses = expenseTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const balance = total_income - total_expenses;

  const byCategory = new Map<TransactionCategory, number>();
  for (const t of expenseTx) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  const category_breakdown: CategoryBreakdownEntry[] = [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total_expenses > 0 ? Math.round((amount / total_expenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byDate = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    const day = t.spent_at.slice(0, 10);
    const entry = byDate.get(day) ?? { income: 0, expense: 0 };
    if (t.amount > 0) entry.income += t.amount;
    else entry.expense += Math.abs(t.amount);
    byDate.set(day, entry);
  }
  const cashflow: CashflowPoint[] = [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const budgets: BudgetLimit[] = Object.entries(BUDGET_LIMITS).map(([category, limit]) => ({
    category: category as TransactionCategory,
    limit: limit as number,
    spent: byCategory.get(category as TransactionCategory) ?? 0,
  }));

  return { balance, total_income, total_expenses, category_breakdown, cashflow, budgets };
}
