export type TransactionCategory =
  | "їжа"
  | "транспорт"
  | "розваги"
  | "комунальні"
  | "підписки"
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

export interface TransactionFilters {
  category?: TransactionCategory;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
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

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

export interface ChatResponse {
  message: ChatMessage;
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

export interface DashboardStats {
  balance: number;
  total_income: number;
  total_expenses: number;
  category_breakdown: CategoryBreakdownEntry[];
  cashflow: CashflowPoint[];
  budgets: BudgetLimit[];
}
