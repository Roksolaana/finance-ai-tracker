import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORY_COLORS, type CategoryBreakdownEntry, type TransactionCategory } from "@finance/shared";
import { CategoryIcon } from "./CategoryIcon";
import { formatMoney } from "../lib/format";

interface CategoryDonutProps {
  data: CategoryBreakdownEntry[];
  total: number;
  onSelectCategory?: (category: TransactionCategory) => void;
}

export function CategoryDonut({ data, total, onSelectCategory }: CategoryDonutProps) {
  return (
    <div className="card h-full p-6">
      <h3 className="card-title mb-5">Структура витрат</h3>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">У цьому місяці витрат немає</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative size-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount"
                  nameKey="category"
                  innerRadius="72%"
                  outerRadius="100%"
                  paddingAngle={2}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((entry) => (
                    <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS["інше"]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E7E3D4", fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-muted">усього</span>
              <span className="text-lg font-semibold tracking-tight">{formatMoney(total)}</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-0.5">
            {data.slice(0, 6).map((entry) => (
              <li key={entry.category}>
                <button
                  onClick={() => onSelectCategory?.(entry.category)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-soft"
                >
                  <CategoryIcon category={entry.category} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm capitalize text-ink-soft">{entry.category}</span>
                  <span className="whitespace-nowrap text-sm font-medium">{formatMoney(entry.amount)}</span>
                  <span className="w-9 shrink-0 text-right text-xs text-muted">{entry.percent}%</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
