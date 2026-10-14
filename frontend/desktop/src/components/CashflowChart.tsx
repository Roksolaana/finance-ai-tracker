import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashflowPoint } from "@finance/shared";

const MONTHS_SHORT = [
  "січ", "лют", "бер", "кві", "трав", "чер",
  "лип", "серп", "вер", "жов", "лис", "гру",
];

function formatDay(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const chartData = data.map((point) => ({ ...point, label: formatDay(point.date) }));

  return (
    <div className="card lg:col-span-3 p-6 flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-ink">Грошовий потік</h3>
        <div className="flex items-center gap-4 text-xs font-medium text-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bar-income" />Доходи
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bar-expense" />Витрати
          </div>
        </div>
      </div>
      <div className="w-full h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--border-soft)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              formatter={(value) => `${Number(value).toLocaleString("uk-UA")} ₴`}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="income" name="Доходи" fill="#9FB07C" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" name="Витрати" fill="#333D21" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
