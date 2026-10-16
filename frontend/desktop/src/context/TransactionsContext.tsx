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
  statsFailed: boolean;
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
  // Дві незалежні помилки: успіх статистики раніше затирав повідомлення про
  // те, що не завантажився список транзакцій, і користувач бачив заповнений
  // дашборд із порожньою таблицею без жодного пояснення.
  const [listError, setListError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  // Порожньо до завантаження: ліміти тепер живуть у БД, а не в дефолтах коду.
  const [budgetLimits, storeBudgetLimits] = useState<BudgetLimits>({});
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  // Будь-яка зміна даних підіймає версію — це перезапитує статистику.
  const [dataVersion, setDataVersion] = useState(0);
  const loadingRef = useRef(false);
  // Лічильник локальних змін. Якщо поки тривало завантаження списку
  // користувач щось додав, стара відповідь уже неактуальна.
  const mutationsRef = useRef(0);

  const invalidateStats = useCallback(() => setDataVersion((v) => v + 1), []);

  const loadTransactions = useCallback(async () => {
    // focus і visibilitychange часто спрацьовують разом; без цього запобіжника
    // пішли б два паралельні завантаження, і старша відповідь могла б
    // перезаписати новішу.
    if (loadingRef.current) return;
    loadingRef.current = true;
    const mutationsAtStart = mutationsRef.current;
    try {
      const [loadedTransactions, loadedLimits] = await Promise.all([api.list(), budgetsApi.get()]);
      // Під час запиту додали чи видалили транзакцію — ця відповідь застаріла.
      if (mutationsRef.current === mutationsAtStart) setTransactions(loadedTransactions);
      storeBudgetLimits(loadedLimits);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Не вдалося завантажити дані");
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
    // Скидаємо перед запитом: інакше при перемиканні місяця на екрані
    // лишалися б цифри попереднього під новим заголовком, а при збої
    // запиту вони б так і висіли як актуальні.
    setMonthStats(null);
    setStatsError(null);
    statsApi
      .month(selectedMonth)
      .then((stats) => {
        if (!cancelled) setMonthStats(stats);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatsError(e instanceof Error ? e.message : "Не вдалося порахувати статистику");
        }
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
      loadError: listError ?? statsError,
      statsFailed: statsError !== null,
      reload,
      addTransaction: async (input) => {
        const created = await api.create(input);
        mutationsRef.current += 1;
        setTransactions((prev) => [created, ...prev]);
        invalidateStats();
      },
      updateTransaction: async (id, input) => {
        const updated = await api.update(id, input);
        mutationsRef.current += 1;
        setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
        invalidateStats();
      },
      deleteTransaction: async (id) => {
        const removed = transactions.find((t) => t.id === id);
        await api.remove(id);
        mutationsRef.current += 1;
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        invalidateStats();
        return removed;
      },
      restoreTransaction: async ({ amount, category, note, spent_at }) => {
        const created = await api.create({ amount, category, note, spent_at });
        mutationsRef.current += 1;
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
    [transactions, monthStats, loading, listError, statsError, reload, invalidateStats, budgetLimits, selectedMonth],
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions() {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
