import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Search, SearchX, X } from "lucide-react";
import { CATEGORIES, filterByMonth, type TransactionCategory } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { TopBar } from "../components/TopBar";
import { TransactionList } from "../components/TransactionList";
import { exportTransactionsToCsv } from "../lib/csv";
import { formatMoney, formatMonth } from "../lib/format";

type TypeFilter = "all" | "expense" | "income";
const PAGE_SIZE = 40;

export function TransactionsPage() {
  const { transactions, selectedMonth } = useTransactions();
  const { showToast } = useUi();
  const [params, setParams] = useSearchParams();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const search = params.get("q") ?? "";
  const category = (params.get("category") ?? "all") as TransactionCategory | "all";
  const type = (params.get("type") ?? "all") as TypeFilter;
  const allTime = params.get("period") === "all";

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setVisible(PAGE_SIZE);
  };

  const filtered = useMemo(() => {
    let result = allTime ? transactions : filterByMonth(transactions, selectedMonth);
    if (type === "expense") result = result.filter((t) => t.amount < 0);
    if (type === "income") result = result.filter((t) => t.amount > 0);
    if (category !== "all") result = result.filter((t) => t.category === category);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((t) => t.note?.toLowerCase().includes(q) || t.category.includes(q));
    return result;
  }, [transactions, selectedMonth, allTime, type, category, search]);

  const income = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = filtered.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const hasFilters = search || category !== "all" || type !== "all";

  return (
    <>
      <TopBar
        title="Транзакції"
        subtitle={allTime ? "Уся історія" : formatMonth(selectedMonth)}
        showMonthPicker={!allTime}
      />

      <div className="card mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => updateParam("q", e.target.value)}
              placeholder="Пошук за нотаткою…"
              className="input pl-10"
            />
          </div>
          <div className="segmented">
            {(
              [
                ["all", "Усі"],
                ["expense", "Витрати"],
                ["income", "Доходи"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} data-active={type === value} onClick={() => updateParam("type", value)}>
                {label}
              </button>
            ))}
          </div>
          <select
            value={category}
            onChange={(e) => updateParam("category", e.target.value)}
            className="input w-44"
          >
            <option value="all">Усі категорії</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <div className="segmented">
            <button data-active={!allTime} onClick={() => updateParam("period", null)}>
              Місяць
            </button>
            <button data-active={allTime} onClick={() => updateParam("period", "all")}>
              Увесь час
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-soft pt-4 text-sm">
          <span className="text-muted">
            Знайдено: <b className="font-semibold text-ink">{filtered.length}</b>
          </span>
          <span className="text-muted">
            Доходи: <b className="font-semibold text-positive">{formatMoney(income)}</b>
          </span>
          <span className="text-muted">
            Витрати: <b className="font-semibold text-ink">{formatMoney(expense)}</b>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {hasFilters && (
              <button onClick={() => setParams(allTime ? { period: "all" } : {}, { replace: true })} className="btn-ghost h-9">
                <X size={15} />
                Скинути фільтри
              </button>
            )}
            <button
              onClick={() => {
                exportTransactionsToCsv(filtered);
                showToast(`Експортовано ${filtered.length} записів у CSV`);
              }}
              disabled={filtered.length === 0}
              className="btn-ghost h-9"
            >
              <Download size={15} />
              CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <SearchX size={30} className="mb-3 text-muted" />
            <p className="font-medium">Нічого не знайдено</p>
            <p className="mt-1 text-sm text-muted">Спробуйте змінити фільтри або обрати інший період.</p>
          </div>
        ) : (
          <>
            <TransactionList transactions={filtered.slice(0, visible)} />
            {visible < filtered.length && (
              <div className="mt-4 flex justify-center">
                <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn-ghost">
                  Показати ще ({filtered.length - visible})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
