import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { CATEGORY_COLORS, createStatsApi, type RecurringPayment, type TransactionCategory } from "@finance/shared";
import { formatMoney } from "../lib/format";

const statsApi = createStatsApi("/api/v1");

function nextDateLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

/**
 * Регулярні платежі: серії, які сервер знайшов сам (близька сума раз на
 * місяць). Порожній блок не показуємо — у нових акаунтів серій ще немає.
 */
export function RecurringList({ reloadKey }: { reloadKey: number }) {
  const [items, setItems] = useState<RecurringPayment[]>([]);

  useEffect(() => {
    let cancelled = false;
    statsApi
      .recurring()
      .then((loaded) => !cancelled && setItems(loaded))
      // Блок довідковий: не прийшов — дашборд працює й без нього.
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (items.length === 0) return null;
  const monthly = items.reduce((sum, item) => sum + item.average_amount, 0);

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="card-title">Регулярні платежі</h3>
        <span className="font-mono text-xs text-muted">≈ {formatMoney(monthly)} / міс</span>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={`${item.name}-${item.next_date}`} className="flex items-center gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `${CATEGORY_COLORS[item.category as TransactionCategory] ?? CATEGORY_COLORS["інше"]}1F` }}
            >
              <Repeat size={15} style={{ color: CATEGORY_COLORS[item.category as TransactionCategory] ?? CATEGORY_COLORS["інше"] }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted">наступне — {nextDateLabel(item.next_date)}</p>
            </div>
            <span className="font-mono text-sm">{formatMoney(item.average_amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
