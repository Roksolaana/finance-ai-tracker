import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { CATEGORY_COLORS, type CategoryBreakdownEntry } from "@finance/shared";

export function CategoryDonut({
  data,
  total,
}: {
  data: CategoryBreakdownEntry[];
  total: number;
}) {
  return (
    <div className="card lg:col-span-2 p-6">
      <h3 className="text-sm font-semibold tracking-tight text-ink mb-5">Структура витрат</h3>
      <div className="flex items-center gap-5">
        <div className="w-[132px] h-[132px] shrink-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="amount"
                nameKey="category"
                innerRadius={47}
                outerRadius={62}
                startAngle={90}
                endAngle={-270}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-[15px] font-semibold text-ink">
              {total.toLocaleString("uk-UA")} ₴
            </span>
            <span className="text-[9px] text-muted">усього витрат</span>
          </div>
        </div>
        <ul className="space-y-2.5 text-xs flex-1 min-w-0">
          {data.map((entry) => (
            <li key={entry.category} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-ink-soft font-medium truncate capitalize">
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[entry.category] }} />
                {entry.category}
              </span>
              <span className="font-mono text-muted shrink-0">
                {entry.amount.toLocaleString("uk-UA")} ₴ · {entry.percent}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
