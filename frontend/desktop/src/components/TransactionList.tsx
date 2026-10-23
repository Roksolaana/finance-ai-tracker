import { ChevronRight } from "lucide-react";
import type { Transaction } from "@finance/shared";
import { dayKey } from "@finance/shared";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";
import { formatDate, formatMoney } from "../lib/format";

function dayLabel(key: string) {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return "Сьогодні";
  if (key === yesterday) return "Вчора";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
}

// showDate — для списків без заголовків днів, де сам час нічого не каже.
export function TransactionRow({ transaction, showDate = false }: { transaction: Transaction; showDate?: boolean }) {
  const { openDetails } = useUi();
  const time = new Date(transaction.spent_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  return (
    <button
      onClick={() => openDetails(transaction.id)}
      className="group flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-milk"
    >
      <CategoryIcon category={transaction.category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{transaction.note || <span className="capitalize">{transaction.category}</span>}</p>
        <p className="text-xs capitalize text-muted">
          {transaction.category} · {showDate ? `${formatDate(transaction.spent_at)}, ${time}` : time}
        </p>
      </div>
      <span className={`text-sm font-semibold ${transaction.amount > 0 ? "text-positive" : ""}`}>
        {formatMoney(transaction.amount, { sign: true })}
      </span>
      {/* Без стрілки рядок виглядав як звичайний текст, і що його можна
          відкрити, ніхто не здогадувався. */}
      <ChevronRight size={16} className="-mr-1 shrink-0 text-muted transition-colors group-hover:text-olive" />
    </button>
  );
}

export function TransactionList({ transactions, grouped = true }: { transactions: Transaction[]; grouped?: boolean }) {
  // При сортуванні за сумою групи по днях розірвали б порядок, тож список плаский.
  if (!grouped) {
    return (
      <div>
        {transactions.map((t) => (
          <TransactionRow key={t.id} transaction={t} showDate />
        ))}
      </div>
    );
  }

  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = dayKey(t.spent_at);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([key, items]) => {
        const net = items.reduce((s, t) => s + t.amount, 0);
        return (
          <section key={key}>
            <div className="mb-1 flex items-center justify-between px-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted first-letter:uppercase">
                {dayLabel(key)}
              </h4>
              <span className="text-xs text-muted">{formatMoney(net, { sign: true })}</span>
            </div>
            <div>
              {items.map((t) => (
                <TransactionRow key={t.id} transaction={t} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
