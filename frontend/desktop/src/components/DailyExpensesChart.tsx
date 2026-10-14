import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CashflowPoint } from "@finance/shared";
import { CHART, formatCompact, formatMoney } from "../lib/format";

export function DailyExpensesChart({ data, average }: { data: CashflowPoint[]; average: number }) {
  const chartData = data.map((point) => ({ day: Number(point.date.slice(8)), expense: point.expense }));

  return (
    <div className="card flex flex-col p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="card-title">Витрати по днях</h3>
          <p className="mt-1 text-xs text-muted">Пунктир — середнє за день: {formatMoney(average)}</p>
        </div>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap={3}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: CHART.axis }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 11, fill: CHART.axis }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={formatCompact}
            />
            <Tooltip
              cursor={{ fill: "#ECEEDF" }}
              formatter={(value) => [formatMoney(Number(value)), "Витрати"]}
              labelFormatter={(day) => `${day} число`}
              contentStyle={{ borderRadius: 12, border: "1px solid #E7E3D4", fontSize: 12 }}
            />
            <ReferenceLine y={average} stroke={CHART.olive} strokeDasharray="4 4" />
            <Bar dataKey="expense" fill={CHART.expense} radius={[6, 6, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
