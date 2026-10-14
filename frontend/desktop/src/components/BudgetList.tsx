import type { BudgetLimit } from "@finance/shared";

function fillClass(spent: number, limit: number) {
  const ratio = spent / limit;
  if (ratio > 1) return "fill-over";
  if (ratio > 0.8) return "fill-warn";
  return "fill-ok";
}

export function BudgetList({ budgets }: { budgets: BudgetLimit[] }) {
  return (
    <div className="card lg:col-span-3 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold tracking-tight text-ink">Ліміти бюджету</h3>
        <button className="text-xs font-medium link-accent">Керувати</button>
      </div>
      <div className="space-y-4">
        {budgets.map((budget) => {
          const overBy = budget.spent - budget.limit;
          const widthPercent = Math.min(100, (budget.spent / budget.limit) * 100);
          return (
            <div key={budget.category}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium text-ink-soft capitalize">{budget.category}</span>
                <span className="font-mono tabular-nums text-muted text-xs">
                  {budget.spent.toLocaleString("uk-UA")} / {budget.limit.toLocaleString("uk-UA")} ₴
                </span>
              </div>
              <div className="w-full progress-track rounded-full h-1.5 overflow-hidden">
                <div
                  className={`${fillClass(budget.spent, budget.limit)} progress-fill h-1.5 rounded-full`}
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              {overBy > 0 && (
                <p className="text-[11px] mt-1" style={{ color: "var(--negative)" }}>
                  Перевищено на {overBy.toLocaleString("uk-UA")} ₴
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
