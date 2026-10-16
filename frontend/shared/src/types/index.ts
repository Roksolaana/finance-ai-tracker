export type TransactionCategory =
  | "їжа"
  | "кафе"
  | "транспорт"
  | "розваги"
  | "комунальні"
  | "підписки"
  | "здоров'я"
  | "покупки"
  | "дохід"
  | "інше";

export interface Transaction {
  id: string;
  amount: number;
  category: TransactionCategory;
  spent_at: string;
  note: string | null;
  created_at: string;
}

export interface TransactionList {
  items: Transaction[];
  total: number;
  page: number;
  per_page: number;
}

export type ChatRole = "user" | "assistant";

export type ToolKind = "sql" | "rag" | "hybrid";

export interface ToolCallInfo {
  name: string;
  kind: ToolKind;
  duration_ms: number;
  matched_transaction_ids?: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  tool_call?: ToolCallInfo;
}

export interface CategoryBreakdownEntry {
  category: TransactionCategory;
  amount: number;
  percent: number;
}

export interface CashflowPoint {
  date: string;
  income: number;
  expense: number;
}

export interface BudgetLimit {
  category: TransactionCategory;
  limit: number;
  spent: number;
}

/** Витрати за днем тижня: 1 — понеділок, 7 — неділя (ISO). */
export interface WeekdayPoint {
  weekday: number;
  amount: number;
}

/** Відповідь `GET /stats/month` — рахується SQL-запитами на бекенді. */
export interface MonthStats {
  month: string;
  total_income: number;
  total_expenses: number;
  balance: number;
  transaction_count: number;
  avg_daily_expense: number;
  savings_rate: number;
  /** Баланс по всіх транзакціях, а не лише за цей місяць. */
  total_balance: number;
  category_breakdown: CategoryBreakdownEntry[];
  cashflow: CashflowPoint[];
  budgets: BudgetLimit[];
  weekday: WeekdayPoint[];
  comparison: PeriodComparison;
  /** Для поточного місяця порівняння йде з 1–N числом минулого. */
  comparison_up_to_day: number | null;
}

export interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface PeriodComparison {
  income_change: number | null;
  expense_change: number | null;
  balance_change: number | null;
}

/** Витрати за категоріями в межах одного місяця. */
export interface CategoryMonthRow {
  month: string;
  amounts: Partial<Record<TransactionCategory, number>>;
}

/** Відповідь `GET /stats/monthly` — дані для сторінки «Аналітика». */
export interface MonthlyStats {
  summaries: MonthlySummary[];
  categories: CategoryMonthRow[];
}
