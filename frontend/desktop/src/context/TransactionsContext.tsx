import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createBudgetsApi,
  createStatsApi,
  createTransactionsApi,
  monthKey,
  type BudgetLimits,
  type MonthStats,
  type Transaction,
  type TransactionInput,
} from "@finance/shared";

export type { TransactionInput };

interface TransactionsContextValue {
  transactions: Transaction[];
  /** Агрегати за вибраний місяць із `GET /stats/month`; null, поки вантажиться. */
  monthStats: MonthStats | null;
  loading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  addTransaction: (input: TransactionInput) => Promise<void>;
  updateTransaction: (id: string, input: TransactionInput) => Promise<void>;
  deleteTransaction: (id: string) => Promise<Transaction | undefined>;
  restoreTransaction: (transaction: Transaction) => Promise<void>;
  budgetLimits: BudgetLimits;
  setBudgetLimits: (limits: BudgetLimits) => Promise<void>;
  selectedMonth: string;
  setSelectedMonth: (key: string) => void;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

const api = createTransactionsApi("/api/v1");
const budgetsApi = createBudgetsApi("/api/v1");
const statsApi = createStatsApi("/api/v1");

const bySpentAtDesc = (a: Transaction, b: Transaction) => b.spent_at.localeCompare(a.spent_at);

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Порожньо до завантаження: ліміти тепер живуть у БД, а не в дефолтах коду.
  const [budgetLimits, storeBudgetLimits] = useState<BudgetLimits>({});
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  // Будь-яка зміна даних підіймає версію — це перезапитує статистику.
  const [dataVersion, setDataVersion] = useState(0);
  const loadingRef = useRef(false);

  const invalidateStats = useCallback(() => setDataVersion((v) => v + 1), []);

  const loadTransactions = useCallback(async () => {
    // focus і visibilitychange часто спрацьовують разом; без цього запобіжника
    // пішли б два паралельні завантаження, і старша відповідь могла б
    // перезаписати новішу.
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [loadedTransactions, loadedLimits] = await Promise.all([api.list(), budgetsApi.get()]);
      setTransactions(loadedTransactions);
      storeBudgetLimits(loadedLimits);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не вдалося завантажити дані");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await loadTransactions();
    invalidateStats();
  }, [loadTransactions, invalidateStats]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Дані могли змінитися в Swagger або в іншій вкладці.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    statsApi
      .month(selectedMonth)
      .then((stats) => {
        if (cancelled) return;
        setMonthStats(stats);
        setLoadError(null);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Не вдалося порахувати статистику");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, dataVersion]);

  const value = useMemo<TransactionsContextValue>(
    () => ({
      transactions: [...transactions].sort(bySpentAtDesc),
      monthStats,
      loading,
      loadError,
      reload,
      addTransaction: async (input) => {
        const created = await api.create(input);
        setTransactions((prev) => [created, ...prev]);
        invalidateStats();
      },
      updateTransaction: async (id, input) => {
        const updated = await api.update(id, input);
        setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
        invalidateStats();
      },
      deleteTransaction: async (id) => {
        const removed = transactions.find((t) => t.id === id);
        await api.remove(id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        invalidateStats();
        return removed;
      },
      restoreTransaction: async ({ amount, category, note, spent_at }) => {
        const created = await api.create({ amount, category, note, spent_at });
        setTransactions((prev) => [created, ...prev]);
        invalidateStats();
      },
      budgetLimits,
      setBudgetLimits: async (limits) => {
        storeBudgetLimits(await budgetsApi.replace(limits));
        invalidateStats();
      },
      selectedMonth,
      setSelectedMonth,
    }),
    [transactions, monthStats, loading, loadError, reload, invalidateStats, budgetLimits, selectedMonth],
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
