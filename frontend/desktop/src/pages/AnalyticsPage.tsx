import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Crown, Percent, TrendingDown, type LucideIcon } from "lucide-react";
import {
  CATEGORY_COLORS,
  EXPENSE_CATEGORIES,
  categoriesByMonth,
  computeMonthStats,
  dayKey,
  filterByMonth,
  monthlySummaries,
  shiftMonth,
  spendingByWeekday,
} from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { TopBar } from "../components/TopBar";
import { TransactionRow } from "../components/TransactionList";
import { CHART, formatCompact, formatMoney, formatMonth, formatMonthShort } from "../lib/format";

const tooltipStyle = { borderRadius: 12, border: "1px solid #E7E3D4", fontSize: 12 };

function Insight({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="card p-5">
      <span className="mb-3 inline-flex size-8 items-center justify-center rounded-xl bg-olive-tint text-olive">
        <Icon size={17} />
      </span>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold capitalize tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function AnalyticsPage() {
  const { transactions, selectedMonth } = useTransactions();
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(selectedMonth, i - 5));

  const summaries = monthlySummaries(transactions, months).map((s) => ({ ...s, label: formatMonthShort(s.month) }));
  const categoryRows = categoriesByMonth(transactions, months).map((r) => ({ ...r, label: formatMonthShort(r.month) }));
  const usedCategories = EXPENSE_CATEGORIES.filter((c) => categoryRows.some((r) => (r[c] ?? 0) > 0));

  const monthTx = filterByMonth(transactions, selectedMonth);
  const stats = computeMonthStats(transactions, selectedMonth);
  const weekdays = spendingByWeekday(monthTx);
  const topExpenses = monthTx.filter((t) => t.amount < 0).sort((a, b) => a.amount - b.amount).slice(0, 5);

  const byDay = new Map<string, number>();
  for (const t of monthTx) if (t.amount < 0) byDay.set(dayKey(t.spent_at), (byDay.get(dayKey(t.spent_at)) ?? 0) + Math.abs(t.amount));
  const [peakDay, peakAmount] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  const totalIncome = summaries.reduce((s, m) => s + m.income, 0);
  const totalNet = summaries.reduce((s, m) => s + m.net, 0);
  const topCategory = stats.category_breakdown[0];

  return (
    <>
      <TopBar title="Аналітика" subtitle={`Пів року до ${formatMonth(selectedMonth).toLowerCase()} включно`} />

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
          <Insight
            icon={TrendingDown}
            label="Середні витрати за день"
            value={formatMoney(stats.avg_daily_expense)}
            hint={formatMonth(selectedMonth)}
          />
          <Insight
            icon={Crown}
            label="Найбільша категорія"
            value={topCategory ? topCategory.category : "—"}
            hint={topCategory ? `${formatMoney(topCategory.amount)} · ${topCategory.percent}% витрат` : "немає витрат"}
          />
          <Insight
            icon={CalendarDays}
            label="Найдорожчий день"
            value={peakDay ? new Date(peakDay).toLocaleDateString("uk-UA", { day: "numeric", month: "long" }) : "—"}
            hint={peakDay ? formatMoney(peakAmount) : "немає витрат"}
          />
          <Insight
            icon={Percent}
            label="Заощаджено за пів року"
            value={formatMoney(totalNet)}
            hint={totalIncome > 0 ? `${Math.round((totalNet / totalIncome) * 100)}% від доходу` : "немає доходів"}
          />
        </div>

        <div className="card p-6">
          <h3 className="card-title">Доходи і витрати</h3>
          <p className="mb-5 mt-1 text-xs text-muted">Лінія — скільки вдалося заощадити за місяць</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={summaries} barGap={4}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.axis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={40} tickFormatter={formatCompact} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [formatMoney(Number(v)), String(name)]} cursor={{ fill: "#ECEEDF" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Доходи" fill={CHART.income} radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" name="Витрати" fill={CHART.expense} radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line dataKey="net" name="Заощаджено" stroke="#A07A1F" strokeWidth={2.5} dot={{ r: 3.5 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 @2xl:grid-cols-5">
          <div className="card p-6 @2xl:col-span-3">
            <h3 className="card-title mb-5">Витрати за категоріями</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryRows}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={40} tickFormatter={formatCompact} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [formatMoney(Number(v)), String(name)]} cursor={{ fill: "#ECEEDF" }} />
                  {usedCategories.map((c, i) => (
                    <Bar
                      key={c}
                      dataKey={c}
                      stackId="spend"
                      fill={CATEGORY_COLORS[c]}
                      maxBarSize={40}
                      radius={i === usedCategories.length - 1 ? [6, 6, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
              {usedCategories.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs capitalize text-ink-soft">
                  <span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="card p-6 @2xl:col-span-2">
            <h3 className="card-title">За днями тижня</h3>
            <p className="mb-5 mt-1 text-xs text-muted">{formatMonth(selectedMonth)}</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdays}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: CHART.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={40} tickFormatter={formatCompact} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatMoney(Number(v)), "Витрати"]} cursor={{ fill: "#ECEEDF" }} />
                  <Bar dataKey="amount" fill={CHART.olive} radius={[6, 6, 2, 2]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="card-title px-2 pb-2 pt-1">Найбільші витрати за {formatMonth(selectedMonth).toLowerCase()}</h3>
          {topExpenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">У цьому місяці витрат немає</p>
          ) : (
            topExpenses.map((t) => <TransactionRow key={t.id} transaction={t} />)
          )}
        </div>
      </div>
    </>
  );
}
