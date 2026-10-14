import { Settings2 } from "lucide-react";
import type { BudgetLimit } from "@finance/shared";
import { CategoryIcon } from "./CategoryIcon";
import { formatMoney } from "../lib/format";

function barColor(ratio: number) {
  if (ratio > 1) return "bg-negative";
  if (ratio > 0.8) return "bg-gold";
  return "bg-olive";
}

export function BudgetList({ budgets, onConfigure }: { budgets: BudgetLimit[]; onConfigure: () => void }) {
  return (
    <div className="card h-full p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="card-title">Ліміти бюджету</h3>
        <button onClick={onConfigure} className="btn-icon -my-2 -mr-2" title="Налаштувати ліміти" aria-label="Налаштувати ліміти">
          <Settings2 size={17} />
        </button>
      </div>
      {budgets.length === 0 && (
        <button onClick={onConfigure} className="w-full rounded-xl border border-dashed border-line py-6 text-sm text-muted hover:border-olive-soft hover:text-ink">
          Встановіть ліміти, щоб контролювати витрати
        </button>
      )}
      <div className="space-y-4">
        {budgets.map((budget) => {
          const ratio = budget.spent / budget.limit;
          const left = budget.limit - budget.spent;
          return (
            <div key={budget.category} className="flex items-center gap-3">
              <CategoryIcon category={budget.category} size={32} />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium capitalize">{budget.category}</span>
                  <span className="text-xs text-muted">
                    {formatMoney(budget.spent)} / {formatMoney(budget.limit)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-milk-deep">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(ratio)}`}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
                <p className={`mt-1 text-[11px] ${left < 0 ? "text-negative" : "text-muted"}`}>
                  {left < 0 ? `Перевищено на ${formatMoney(-left)}` : `Залишилось ${formatMoney(left)}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
