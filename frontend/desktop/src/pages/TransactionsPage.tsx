import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Search, SearchX, X } from "lucide-react";
import { CATEGORIES, filterByMonth, type TransactionCategory } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { TopBar } from "../components/TopBar";
import { TransactionList } from "../components/TransactionList";
import { exportTransactionsToCsv } from "../lib/csv";
import { formatMoney } from "../lib/format";

type TypeFilter = "all" | "expense" | "income";
type SortOrder = "date" | "amount";
const PAGE_SIZE = 40;

export function TransactionsPage() {
  const { transactions, selectedMonth } = useTransactions();
  const { showToast } = useUi();
  const [params, setParams] = useSearchParams();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const search = params.get("q") ?? "";
  // Значення з URL може бути будь-яким: без перевірки у <select> не лишалося
  // б жодного вибраного пункту, а фільтр мовчки нічого не знаходив.
  const categoryParam = params.get("category");
  const category: TransactionCategory | "all" =
    categoryParam && (CATEGORIES as readonly string[]).includes(categoryParam)
      ? (categoryParam as TransactionCategory)
      : "all";
  const typeParam = params.get("type");
  const type: TypeFilter = typeParam === "expense" || typeParam === "income" ? typeParam : "all";
  const sort: SortOrder = params.get("sort") === "amount" ? "amount" : "date";
  const allTimeParam = params.get("period");
  const allTime = allTimeParam === "all";

  // Інакше після переходу на інший місяць лишалася розгорнутою попередня
  // кількість рядків, хоча список уже інший.
  useEffect(() => setVisible(PAGE_SIZE), [selectedMonth, allTimeParam]);

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
    // Список з контексту вже відсортований за датою (новіші вгорі), тож
    // переставляємо лише для сортування за сумою. Модуль — щоб великий дохід
    // і велика витрата стояли поруч, а не на різних кінцях списку.
    if (sort === "amount") result = [...result].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return result;
  }, [transactions, selectedMonth, allTime, type, category, search, sort]);

  const income = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = filtered.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const hasFilters = search || category !== "all" || type !== "all";

  return (
    <>
      <TopBar
        title="Транзакції"
        // Місяць і так видно в перемикачі поруч — підзаголовок лише для всієї історії.
        subtitle={allTime ? "Уся історія" : undefined}
        showMonthPicker={!allTime}
      />

      <div className="card mb-5 p-4">
        {/* Два рядки з фіксованим складом: коли все стояло в одному
            flex-wrap, елементи переносилися по-різному залежно від ширини. */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="tx-search" className="sr-only">
              Пошук за нотаткою або категорією
            </label>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="tx-search"
              type="search"
              value={search}
              onChange={(e) => updateParam("q", e.target.value)}
              placeholder="Пошук за нотаткою або категорією…"
              className="input pl-10"
            />
          </div>
          <label htmlFor="tx-category" className="sr-only">
            Категорія
          </label>
          <select
            id="tx-category"
            value={category}
            onChange={(e) => updateParam("category", e.target.value)}
            className="input w-44 shrink-0"
          >
            <option value="all">Усі категорії</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <label htmlFor="tx-sort" className="sr-only">
            Сортування
          </label>
          <select
            id="tx-sort"
            value={sort}
            onChange={(e) => updateParam("sort", e.target.value === "date" ? null : e.target.value)}
            className="input w-44 shrink-0"
          >
            <option value="date">Спершу нові</option>
            <option value="amount">Спершу більші суми</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="segmented" role="group" aria-label="Тип транзакцій">
            {(
              [
                ["all", "Усі"],
                ["expense", "Витрати"],
                ["income", "Доходи"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                data-active={type === value}
                aria-pressed={type === value}
                onClick={() => updateParam("type", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Період">
            <button data-active={!allTime} aria-pressed={!allTime} onClick={() => updateParam("period", null)}>
              Місяць
            </button>
            <button data-active={allTime} aria-pressed={allTime} onClick={() => updateParam("period", "all")}>
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
              <button
                onClick={() => {
                  // Період і порядок — не фільтри, їх скидання не чіпає.
                  const next = new URLSearchParams();
                  if (allTime) next.set("period", "all");
                  if (sort !== "date") next.set("sort", sort);
                  setParams(next, { replace: true });
                  setVisible(PAGE_SIZE);
                }}
                className="btn-ghost h-9"
              >
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
            <TransactionList transactions={filtered.slice(0, visible)} grouped={sort === "date"} />
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
