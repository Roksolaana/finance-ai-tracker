import { useMemo, useState } from "react";
import { CATEGORIES, type TransactionCategory } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { AddTransactionDialog } from "../components/AddTransactionDialog";
import { exportTransactionsToCsv } from "../lib/csv";

const PER_PAGE = 5;
type SortKey = "spent_at" | "amount";

export function TransactionsPage() {
  const { transactions, addTransaction, resetDemoData: loadDemoData } = useTransactions();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TransactionCategory | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("spent_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let result = transactions;
    if (category !== "all") {
      result = result.filter((t) => t.category === category);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((t) => t.note?.toLowerCase().includes(q));
    }
    const sorted = [...result].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "amount") return (a.amount - b.amount) * dir;
      return (new Date(a.spent_at).getTime() - new Date(b.spent_at).getTime()) * dir;
    });
    return sorted;
  }, [transactions, category, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "");

  return (
    <main className="pane-scroll flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">Транзакції</h1>
          <p className="text-sm text-muted mt-1">Усі витрати й доходи в одному місці</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadDemoData}
            className="btn-ghost inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            Завантажити демо-дані
          </button>
          <button
            onClick={() => exportTransactionsToCsv(filtered)}
            className="btn-ghost inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <svg className="icon w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Експорт CSV
          </button>
          <AddTransactionDialog onAdd={addTransaction} />
        </div>
      </header>

      <div className="card overflow-hidden">
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-c flex-wrap gap-3"
          style={{ background: "var(--surface-soft)" }}
        >
          <h3 className="text-sm font-semibold tracking-tight text-ink">
            {filtered.length} транзакцій
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <svg
                className="icon absolute left-2.5 top-2.5 w-4 h-4 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Пошук за нотаткою..."
                className="input-field pl-9 pr-3 py-1.5 text-sm rounded-md w-44 sm:w-52"
              />
            </div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as TransactionCategory | "all");
                setPage(1);
              }}
              className="input-field px-3 py-1.5 text-sm rounded-md text-ink-soft capitalize"
            >
              <option value="all">Усі категорії</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="table-head text-xs border-b">
              <tr>
                <th className="px-6 py-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("spent_at")}>
                  Дата {sortArrow("spent_at")}
                </th>
                <th className="px-6 py-3 font-medium">Категорія</th>
                <th className="px-6 py-3 font-medium">Нотатка</th>
                <th
                  className="px-6 py-3 font-medium text-right cursor-pointer select-none"
                  onClick={() => toggleSort("amount")}
                >
                  Сума {sortArrow("amount")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-c-soft">
              {pageItems.map((t) => (
                <tr key={t.id} className="table-row">
                  <td className="px-6 py-3 font-mono text-muted text-xs">
                    {new Date(t.spent_at).toLocaleDateString("uk-UA")}
                  </td>
                  <td className="px-6 py-3">
                    <span className="badge-cat inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium capitalize">
                      {t.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-ink">{t.note}</td>
                  <td
                    className={`px-6 py-3 font-mono tabular-nums text-right font-medium ${
                      t.amount > 0 ? "amount-pos" : "amount-neg"
                    }`}
                  >
                    {t.amount > 0 ? "+" : ""}
                    {t.amount.toLocaleString("uk-UA")} ₴
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-muted text-sm">
                    Нічого не знайдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-foot px-6 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted">
            Сторінка {currentPage} з {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="btn-ghost px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
            >
              Назад
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="btn-ghost px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
            >
              Далі
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
