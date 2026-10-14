import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { mockTransactions, type Transaction, type TransactionCategory } from "@finance/shared";

interface TransactionsContextValue {
  transactions: Transaction[];
  addTransaction: (input: {
    amount: number;
    category: TransactionCategory;
    note: string | null;
    spent_at: string;
  }) => void;
  loadDemoData: () => void;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

// Тимчасова заміна реального useTransactions() зі Етапу 3 — тримає дані
// в React-стані на рівні застосунку, щоб UI з обох сторінок бачив одні й ті самі записи.
// Старт порожній: демо-набір підвантажується вручну кнопкою "Завантажити демо-дані".
export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const addTransaction: TransactionsContextValue["addTransaction"] = (input) => {
    const transaction: Transaction = {
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...input,
    };
    setTransactions((prev) => [transaction, ...prev]);
  };

  const loadDemoData = () => setTransactions(mockTransactions);

  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => new Date(b.spent_at).getTime() - new Date(a.spent_at).getTime(),
      ),
    [transactions],
  );

  return (
    <TransactionsContext.Provider value={{ transactions: sorted, addTransaction, loadDemoData }}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
