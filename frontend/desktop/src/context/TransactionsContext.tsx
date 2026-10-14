import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  BUDGET_LIMITS,
  demoTransactions,
  generateDemoTransactions,
  monthKey,
  type BudgetLimits,
  type Transaction,
  type TransactionCategory,
} from "@finance/shared";

export interface TransactionInput {
  amount: number;
  category: TransactionCategory;
  note: string | null;
  spent_at: string;
}

interface TransactionsContextValue {
  transactions: Transaction[];
  addTransaction: (input: TransactionInput) => void;
  updateTransaction: (id: string, input: TransactionInput) => void;
  deleteTransaction: (id: string) => Transaction | undefined;
  restoreTransaction: (transaction: Transaction) => void;
  resetDemoData: () => void;
  budgetLimits: BudgetLimits;
  setBudgetLimits: (limits: BudgetLimits) => void;
  selectedMonth: string;
  setSelectedMonth: (key: string) => void;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

// Тимчасова заміна реального API (Етап 3): дані живуть у пам'яті застосунку
// й стартують з демо-набору, поки немає підключення до бекенду.
export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [budgetLimits, setBudgetLimits] = useState<BudgetLimits>(BUDGET_LIMITS);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));

  const value = useMemo<TransactionsContextValue>(
    () => ({
      transactions: [...transactions].sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
      addTransaction: (input) =>
        setTransactions((prev) => [
          { id: `local-${crypto.randomUUID()}`, created_at: new Date().toISOString(), ...input },
          ...prev,
        ]),
      updateTransaction: (id, input) =>
        setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } : t))),
      deleteTransaction: (id) => {
        const removed = transactions.find((t) => t.id === id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        return removed;
      },
      restoreTransaction: (transaction) => setTransactions((prev) => [transaction, ...prev]),
      resetDemoData: () => {
        setTransactions(generateDemoTransactions());
        setBudgetLimits(BUDGET_LIMITS);
      },
      budgetLimits,
      setBudgetLimits,
      selectedMonth,
      setSelectedMonth,
    }),
    [transactions, budgetLimits, selectedMonth],
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
