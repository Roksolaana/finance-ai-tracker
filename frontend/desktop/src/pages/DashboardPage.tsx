import { useNavigate, Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ChevronRight, PiggyBank, Plus } from "lucide-react";
import { filterByMonth } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { TopBar } from "../components/TopBar";
import { KpiTile } from "../components/KpiTile";
import { DailyExpensesChart } from "../components/DailyExpensesChart";
import { CategoryDonut } from "../components/CategoryDonut";
import { BudgetList } from "../components/BudgetList";
import { TransactionList } from "../components/TransactionList";
import { formatMoney } from "../lib/format";

export function DashboardPage() {
  const { transactions, selectedMonth, monthStats, statsFailed, reload } = useTransactions();
  const { openAddForm, setBudgetsOpen } = useUi();
  const navigate = useNavigate();

  const monthTransactions = filterByMonth(transactions, selectedMonth);

  if (!monthStats) {
    return (
      <>
        <TopBar title="Огляд" />
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
      </>
    );
  }

  const stats = monthStats;
  const change = stats.comparison;
  // Для незавершеного місяця бекенд порівнює з таким самим відрізком днів.
  const changeHint = stats.comparison_up_to_day
    ? `проти 1–${stats.comparison_up_to_day} числа мин. місяця`
    : "від попереднього місяця";

  return (
    <>
      <TopBar title="Огляд" />

      {stats.transaction_count === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
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
            {/* Інакше в порожньому місяці діалог лімітів недосяжний:
                його кнопка живе в картці бюджетів, якої тут немає. */}
            <button onClick={() => setBudgetsOpen(true)} className="btn-ghost">
              Налаштувати ліміти
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5 @4xl:grid-cols-4">
            <div className="relative col-span-2 overflow-hidden rounded-card bg-linear-to-br from-olive-deep to-olive p-6 text-white shadow-card">
              <svg className="absolute -right-10 -top-10 size-56 opacity-15" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                <circle cx="100" cy="100" r="40" />
                <circle cx="100" cy="100" r="62" />
                <circle cx="100" cy="100" r="84" />
              </svg>
              {/* Головне число — за вибраний місяць. Раніше тут стояв баланс за
                  весь час, і при перемиканні місяця воно не змінювалося. */}
              <p className="text-sm text-white/70">
                {stats.balance >= 0 ? "Заощаджено за місяць" : "Перевитрата за місяць"}
              </p>
              <p className="mt-2 font-display text-[34px] font-semibold leading-none tracking-tight">
                {formatMoney(stats.balance, { sign: true })}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                <span className="chip bg-white/15 text-white">
                  Баланс за весь час: {formatMoney(stats.total_balance)}
                </span>
                {/* Лише при додатній нормі: при перевитраті вийшло б
                    безглузде «−25% доходу збережено». */}
                {stats.savings_rate > 0 && (
                  <span className="chip bg-white/15 text-white">
                    {Math.round(stats.savings_rate * 100)}% доходу збережено
                  </span>
                )}
              </div>
            </div>
            <KpiTile
              label="Доходи"
              value={formatMoney(stats.total_income)}
              icon={ArrowUpRight}
              change={change.income_change}
              changeHint={changeHint}
            />
            <KpiTile
              label="Витрати"
              value={formatMoney(stats.total_expenses)}
              icon={ArrowDownRight}
              change={change.expense_change}
              changeHint={changeHint}
              invertTrend
            />
          </div>

          <DailyExpensesChart data={stats.cashflow} average={stats.avg_daily_expense} />

          <div className="grid grid-cols-1 gap-5 @2xl:grid-cols-5">
            <div className="@2xl:col-span-3">
              <CategoryDonut
                data={stats.category_breakdown}
                total={stats.total_expenses}
                onSelectCategory={(c) => navigate(`/transactions?category=${encodeURIComponent(c)}`)}
              />
            </div>
            <div className="@2xl:col-span-2">
              <BudgetList budgets={stats.budgets} onConfigure={() => setBudgetsOpen(true)} />
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <h3 className="card-title">Останні транзакції</h3>
              <Link to="/transactions" className="flex items-center gap-0.5 text-sm font-medium text-olive hover:text-olive-deep">
                Усі транзакції
                <ChevronRight size={16} />
              </Link>
            </div>
            <TransactionList transactions={monthTransactions.slice(0, 6)} />
          </div>
        </div>
      )}
    </>
  );
}
