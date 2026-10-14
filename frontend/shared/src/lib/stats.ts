import { BUDGET_LIMITS, EXPENSE_CATEGORIES } from "../constants";
import type {
  BudgetLimit,
  CashflowPoint,
  CategoryBreakdownEntry,
  DashboardStats,
  MonthlySummary,
  PeriodComparison,
  Transaction,
  TransactionCategory,
} from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

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

export function upToDayOfMonth(transactions: Transaction[], day: number): Transaction[] {
  return transactions.filter((t) => new Date(t.spent_at).getDate() <= day);
}

export function availableMonths(transactions: Transaction[]): string[] {
  return [...new Set(transactions.map((t) => monthKey(t.spent_at)))].sort().reverse();
}

function daysInPeriod(key: string, today = new Date()): number {
  const [y, m] = key.split("-").map(Number);
  if (key === monthKey(today)) return today.getDate();
  return new Date(y, m, 0).getDate();
}

function sumExpensesByCategory(transactions: Transaction[]) {
  const byCategory = new Map<TransactionCategory, number>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  return byCategory;
}

export type BudgetLimits = Partial<Record<TransactionCategory, number>>;

export function computeMonthStats(
  allTransactions: Transaction[],
  key: string,
  limits: BudgetLimits = BUDGET_LIMITS,
): DashboardStats {
  const transactions = filterByMonth(allTransactions, key);
  const total_income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const total_expenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCategory = sumExpensesByCategory(transactions);
  const category_breakdown: CategoryBreakdownEntry[] = [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total_expenses > 0 ? Math.round((amount / total_expenses) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const cashflow: CashflowPoint[] = Array.from({ length: days }, (_, i) => ({
    date: `${key}-${pad(i + 1)}`,
    income: 0,
    expense: 0,
  }));
  for (const t of transactions) {
    const point = cashflow[new Date(t.spent_at).getDate() - 1];
    if (t.amount > 0) point.income += t.amount;
    else point.expense += Math.abs(t.amount);
  }

  const budgets: BudgetLimit[] = Object.entries(limits).map(([category, limit]) => ({
    category: category as TransactionCategory,
    limit: limit as number,
    spent: byCategory.get(category as TransactionCategory) ?? 0,
  }));

  return {
    balance: total_income - total_expenses,
    total_income,
    total_expenses,
    category_breakdown,
    cashflow,
    budgets,
    transaction_count: transactions.length,
    avg_daily_expense: total_expenses / daysInPeriod(key),
    savings_rate: total_income > 0 ? (total_income - total_expenses) / total_income : 0,
  };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function comparePeriods(current: DashboardStats, previous: DashboardStats): PeriodComparison {
  return {
    income_change: percentChange(current.total_income, previous.total_income),
    expense_change: percentChange(current.total_expenses, previous.total_expenses),
    balance_change: percentChange(current.balance, previous.balance),
  };
}

export function totalBalance(transactions: Transaction[]): number {
  return transactions.reduce((s, t) => s + t.amount, 0);
}

export function monthlySummaries(transactions: Transaction[], months: string[]): MonthlySummary[] {
  return months.map((month) => {
    const items = filterByMonth(transactions, month);
    const income = items.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = items.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { month, income, expense, net: income - expense };
  });
}

export type CategoryMonthRow = { month: string } & Partial<Record<TransactionCategory, number>>;

export function categoriesByMonth(transactions: Transaction[], months: string[]): CategoryMonthRow[] {
  return months.map((month) => {
    const byCategory = sumExpensesByCategory(filterByMonth(transactions, month));
    const row: CategoryMonthRow = { month };
    for (const category of EXPENSE_CATEGORIES) row[category] = byCategory.get(category) ?? 0;
    return row;
  });
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export function spendingByWeekday(transactions: Transaction[]) {
  const totals = new Array(7).fill(0);
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const index = (new Date(t.spent_at).getDay() + 6) % 7;
    totals[index] += Math.abs(t.amount);
  }
  return WEEKDAYS.map((day, i) => ({ day, amount: totals[i] }));
}
