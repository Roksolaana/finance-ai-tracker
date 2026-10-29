import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ChevronRight, PiggyBank, Plus } from "lucide-react";
import { MONTH_NAMES, createStatsApi, filterByMonth, monthKey, type MonthStats } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { KpiTile } from "../components/KpiTile";
import { DailyExpensesChart } from "../components/DailyExpensesChart";
import { CategoryBlocks } from "../components/CategoryBlocks";
import { BudgetList } from "../components/BudgetList";
import { TransactionList } from "../components/TransactionList";
import { TreeRings } from "../components/Rings";
import { formatMoney, splitMoney } from "../lib/format";

const statsApi = createStatsApi("/api/v1");
const RING_MONTHS = 6;

function daysWord(n: number) {
  const tens = n % 100;
  const last = n % 10;
  if (tens >= 11 && tens <= 14) return "днів";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дні";
  return "днів";
}

function SavingsHero({ stats, nets }: { stats: MonthStats; nets: number[] }) {
  const [year, month] = stats.month.split("-").map(Number);
  const monthName = MONTH_NAMES[month - 1].toLowerCase();
  const isCurrent = stats.month === monthKey(new Date());
  const daysLeft = isCurrent ? new Date(year, month, 0).getDate() - new Date().getDate() : 0;
  const spentShare = stats.total_income > 0 ? stats.total_expenses / stats.total_income : null;
  const [amount, currency] = splitMoney(stats.balance, { sign: true });

  return (
    <div className="relative flex flex-col overflow-hidden rounded-card bg-forest px-8 py-7 text-white shadow-card">
      <TreeRings nets={nets} size={260} className="pointer-events-none absolute -right-12 top-6 hidden @2xl:block" />

      <p className="eyebrow relative flex items-center gap-2.5 text-olive-soft">
        {/* Головне число — за вибраний місяць, а не баланс за весь час:
            інакше воно не змінювалося б при перемиканні місяця. */}
        {stats.balance >= 0 ? "Заощаджено" : "Перевитрата"} · {monthName}
        {isCurrent && (
          <span className="rounded-full bg-white/10 px-2.5 py-1 normal-case tracking-normal text-white/85">
            {daysLeft === 0 ? "останній день" : `ще ${daysLeft} ${daysWord(daysLeft)}`}
          </span>
        )}
      </p>
      <p className="relative mt-4 whitespace-nowrap font-display text-[clamp(52px,6cqw,80px)] font-semibold leading-none tracking-tight">
        {amount}
        <span className="ml-2 text-[0.5em] text-olive-soft">{currency}</span>
      </p>
      <div className="relative mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="chip bg-white/10 px-3.5 py-1.5 text-[13px] text-white">
          Баланс за весь час: <b className="font-semibold">{formatMoney(stats.total_balance)}</b>
        </span>
        {/* Лише при додатній нормі: при перевитраті вийшло б «−25% доходу збережено». */}
        {stats.savings_rate > 0 && (
          <span className="chip bg-cream px-3.5 py-1.5 text-[13px] font-semibold text-forest">
            {Math.round(stats.savings_rate * 100)}% доходу збережено
          </span>
        )}
      </div>

      {/* flex-1 притискає смужку донизу, коли картку тягнуть сусідні плитки. */}
      <div className="min-h-6 flex-1" />

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        {spentShare !== null && (
          <div className="w-full max-w-md">
            <div className="mb-2.5 flex justify-between font-mono text-xs text-white/75">
              <span>
                {spentShare > 1 ? "Витрати перевищили дохід" : `Витрачено ${Math.round(spentShare * 100)}% доходу`}
              </span>
              <span>
                {splitMoney(stats.total_expenses)[0]} / {formatMoney(stats.total_income)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-700 ${spentShare > 1 ? "bg-[#e08a73]" : "bg-olive-soft"}`}
                style={{ width: `${Math.min(spentShare, 1) * 100}%` }}
              />
            </div>
          </div>
        )}
        <p className="hidden rounded-lg bg-forest/85 px-2 py-1 text-right font-mono text-[11px] leading-relaxed text-white/70 @2xl:block">
          <span className="mr-1.5 inline-block size-2.5 rounded-full border-2 border-cream align-[-1px]" />
          {monthName} · {formatMoney(stats.balance)}
          <br />
          кільце = місяць заощаджень
        </p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { transactions, selectedMonth, monthStats, statsStale, statsFailed, dataVersion, reload } = useTransactions();
  const { openAddForm, setBudgetsOpen } = useUi();
  const navigate = useNavigate();
  const [nets, setNets] = useState<number[]>([]);

  // Кільця — прикраса: якщо підсумки за пів року не прийшли, малюємо рівні.
  useEffect(() => {
    let cancelled = false;
    statsApi
      .monthly(selectedMonth, RING_MONTHS)
      .then((data) => !cancelled && setNets(data.summaries.map((s) => s.net)))
      .catch(() => !cancelled && setNets([]));
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, dataVersion]);

  const monthTransactions = filterByMonth(transactions, selectedMonth);

  if (!monthStats) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        {statsFailed ? (
          <>
            <p className="text-sm text-muted">Не вдалося порахувати статистику.</p>
            <button onClick={reload} className="btn-ghost mt-4">
              Спробувати знову
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Завантаження статистики…</p>
        )}
      </div>
    );
  }

  const stats = monthStats;
  const change = stats.comparison;
  // Для незавершеного місяця бекенд порівнює з таким самим відрізком днів.
  const changeHint = stats.comparison_up_to_day
    ? `проти 1–${stats.comparison_up_to_day} числа мин. місяця`
    : "від попереднього місяця";

  if (stats.transaction_count === 0) {
    return (
      <div aria-busy={statsStale} className="stale-fade card flex flex-col items-center px-6 py-16 text-center">
        <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-olive-tint text-olive">
          <PiggyBank size={26} />
        </span>
        <p className="font-display text-lg font-semibold">У цьому місяці ще немає записів</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Додайте першу витрату чи дохід — статистика й графіки з'являться автоматично.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button onClick={openAddForm} className="btn-primary">
            <Plus size={17} />
            Додати транзакцію
          </button>
          {/* У порожньому місяці картки лімітів немає, тож кнопка тут. */}
          <button onClick={() => setBudgetsOpen(true)} className="btn-ghost">
            Налаштувати ліміти
          </button>
        </div>
      </div>
    );
  }

  const kpis = (
    <>
      <KpiTile
        label="Доходи"
        value={stats.total_income}
        icon={ArrowUpRight}
        tone="positive"
        change={change.income_change}
        changeHint={changeHint}
      />
      <KpiTile
        label="Витрати"
        value={stats.total_expenses}
        icon={ArrowDownRight}
        tone="negative"
        change={change.expense_change}
        changeHint={changeHint}
        invertTrend
      />
    </>
  );
  const hero = <SavingsHero stats={stats} nets={nets} />;
  const chart = <DailyExpensesChart data={stats.cashflow} average={stats.avg_daily_expense} />;
  const categories = (
    <CategoryBlocks
      data={stats.category_breakdown}
      total={stats.total_expenses}
      onSelectCategory={(c) => navigate(`/transactions?category=${encodeURIComponent(c)}`)}
    />
  );
  const limits = <BudgetList budgets={stats.budgets} onConfigure={() => setBudgetsOpen(true)} />;
  const recent = (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between px-3 pt-2">
        <h3 className="card-title">Останні транзакції</h3>
        <Link to="/transactions" className="flex items-center gap-0.5 text-sm font-medium text-ink hover:text-olive">
          Усі транзакції
          <ChevronRight size={16} />
        </Link>
      </div>
      <TransactionList transactions={monthTransactions.slice(0, 6)} />
    </div>
  );

  return (
    <div aria-busy={statsStale} className="stale-fade space-y-5">
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[1fr_300px]">
        {hero}
        <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2 @4xl:grid-cols-1">{kpis}</div>
      </div>
      {chart}
      {categories}
      {/* Транзакції й ліміти майже однакові заввишки, тож поруч не лишають порожнечі. */}
      <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-2">
        {recent}
        {limits}
      </div>
    </div>
  );
}
