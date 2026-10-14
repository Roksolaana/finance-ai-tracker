import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  demoTransactions,
  generateDemoTransactions,
  monthKey,
  type Transaction,
  type TransactionCategory,
} from "@finance/shared";

export interface NewTransactionInput {
  amount: number;
  category: TransactionCategory;
  note: string | null;
  spent_at: string;
}

interface TransactionsContextValue {
  transactions: Transaction[];
  addTransaction: (input: NewTransactionInput) => void;
  updateTransaction: (id: string, input: NewTransactionInput) => void;
  deleteTransaction: (id: string) => void;
  resetDemoData: () => void;
  selectedMonth: string;
  setSelectedMonth: (key: string) => void;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

// Тимчасова заміна реального useTransactions() зі Етапу 3: дані живуть у пам'яті
// застосунку й стартують з демо-набору, поки немає підключення до бекенду.
export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));

  const addTransaction = (input: NewTransactionInput) => {
    const transaction: Transaction = {
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...input,
    };
    setTransactions((prev) => [transaction, ...prev]);
  };

  const updateTransaction = (id: string, input: NewTransactionInput) =>
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } : t)));

  const deleteTransaction = (id: string) => setTransactions((prev) => prev.filter((t) => t.id !== id));

  const resetDemoData = () => setTransactions(generateDemoTransactions());

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
    [transactions],
  );

  return (
    <TransactionsContext.Provider
      value={{
        transactions: sorted,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        resetDemoData,
        selectedMonth,
        setSelectedMonth,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
