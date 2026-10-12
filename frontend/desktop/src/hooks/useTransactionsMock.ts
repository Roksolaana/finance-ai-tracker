import { useMemo, useState } from "react";
import {
  mockTransactions,
  type Transaction,
  type TransactionCategory,
} from "@finance/shared";

// Тимчасова заміна useTransactions() зі Етапу 3 — тримає мок-дані в React-стані,
// щоб форма додавання й таблиця вже працювали до появи реального API.
export function useTransactionsMock() {
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);

  const addTransaction = (input: {
    amount: number;
    category: TransactionCategory;
    note: string | null;
    spent_at: string;
  }) => {
    const transaction: Transaction = {
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...input,
    };
    setTransactions((prev) => [transaction, ...prev]);
  };

  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => new Date(b.spent_at).getTime() - new Date(a.spent_at).getTime(),
      ),
    [transactions],
  );

  return { transactions: sorted, addTransaction };
}
