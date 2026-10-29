import { SlidersHorizontal } from "lucide-react";
import { CATEGORY_COLORS, type BudgetLimit } from "@finance/shared";
import { formatMoney } from "../lib/format";

const SEGMENTS = 20;

function segmentColor(ratio: number) {
  if (ratio > 1) return "bg-negative";
  if (ratio > 0.8) return "bg-gold";
  return "bg-olive";
}

export function BudgetList({ budgets, onConfigure }: { budgets: BudgetLimit[]; onConfigure: () => void }) {
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="card-title">Ліміти</h3>
        <button
          onClick={onConfigure}
          className="btn-icon size-10 border border-line"
          title="Налаштувати ліміти"
          aria-label="Налаштувати ліміти"
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>
      {budgets.length === 0 && (
        <button onClick={onConfigure} className="w-full rounded-2xl border border-dashed border-line py-6 text-sm text-muted hover:border-olive-soft hover:text-ink">
          Встановіть ліміти, щоб контролювати витрати
        </button>
      )}
      <div className="space-y-4">
        {budgets.map((budget) => {
          const ratio = budget.limit > 0 ? budget.spent / budget.limit : 0;
          const left = budget.limit - budget.spent;
          // Сегментів заповнено стільки, скільки витрачено; хоч трохи витрачене — хоч один.
          const filled = Math.min(SEGMENTS, Math.ceil(ratio * SEGMENTS));
          return (
            <div key={budget.category}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[budget.category] ?? CATEGORY_COLORS["інше"] }} />
                  <span className="first-letter:uppercase">{budget.category}</span>
                </span>
                <span className="font-mono text-xs text-muted">
                  {formatMoney(budget.spent)} / {formatMoney(budget.limit)}
                </span>
              </div>
              <div
                className="flex gap-[3px]"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={budget.limit}
                aria-valuenow={Math.min(budget.spent, budget.limit)}
                aria-label={`Ліміт «${budget.category}»`}
              >
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3.5 flex-1 rounded-[4px] transition-colors duration-500 ${i < filled ? segmentColor(ratio) : "bg-milk-deep"}`}
                  />
                ))}
              </div>
              <p className={`mt-1.5 text-xs ${left < 0 ? "font-semibold text-negative" : "text-muted"}`}>
                {left < 0 ? `Перевищено на ${formatMoney(-left)}` : `Залишилось ${formatMoney(left)}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
