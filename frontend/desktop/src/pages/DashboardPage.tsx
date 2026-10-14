import { KpiTile } from "../components/KpiTile";
import { CashflowChart } from "../components/CashflowChart";
import { CategoryDonut } from "../components/CategoryDonut";
import { BudgetList } from "../components/BudgetList";
import { computeMonthStats } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";

export function DashboardPage() {
  const { transactions, resetDemoData: loadDemoData, selectedMonth } = useTransactions();
  const stats = computeMonthStats(transactions, selectedMonth);
  const recent = transactions.slice(0, 5);

  return (
    <main className="pane-scroll flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
            Привіт, Роксолано
          </h1>
          <p className="text-sm text-muted mt-1">Огляд фінансів</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadDemoData}
            className="btn-ghost inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            Завантажити демо-дані
          </button>
        </div>
      </header>

      {transactions.length === 0 ? (
        <div className="card p-10 text-center mb-6">
          <p className="font-display text-lg text-ink mb-2">Ще немає жодної транзакції</p>
          <p className="text-sm text-muted mb-5">
            Додайте транзакцію вручну на сторінці "Транзакції" або завантажте демо-дані, щоб побачити застосунок у дії.
          </p>
          <button
            onClick={loadDemoData}
            className="btn-primary inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            Завантажити демо-дані
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
            <KpiTile
              label="Загальний баланс"
              value={`${stats.balance.toLocaleString("uk-UA")} ₴`}
              iconPath="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
            <KpiTile
              label="Витрати"
              value={`${stats.total_expenses.toLocaleString("uk-UA")} ₴`}
              iconPath="M19 14l-7 7-7-7M12 21V3"
            />
            <KpiTile
              label="Доходи"
              value={`${stats.total_income.toLocaleString("uk-UA")} ₴`}
              iconPath="M5 10l7-7 7 7M12 3v18"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
            <CashflowChart data={stats.cashflow} />
            <CategoryDonut data={stats.category_breakdown} total={stats.total_expenses} />
          </div>

          {stats.budgets.length > 0 && (
            <div className="grid grid-cols-1 gap-5 mb-6">
              <BudgetList budgets={stats.budgets} />
            </div>
          )}

          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-c"
              style={{ background: "var(--surface-soft)" }}
            >
              <h3 className="text-sm font-semibold tracking-tight text-ink">Останні транзакції</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[640px]">
                <thead className="table-head text-xs border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">Дата</th>
                    <th className="px-6 py-3 font-medium">Категорія</th>
                    <th className="px-6 py-3 font-medium">Опис</th>
                    <th className="px-6 py-3 font-medium text-right">Сума</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-c-soft">
                  {recent.map((transaction) => (
                    <tr key={transaction.id} className="table-row">
                      <td className="px-6 py-3 font-mono text-muted text-xs">
                        {new Date(transaction.spent_at).toLocaleDateString("uk-UA")}
                      </td>
                      <td className="px-6 py-3">
                        <span className="badge-cat inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium capitalize">
                          {transaction.category}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-ink">{transaction.note}</td>
                      <td
                        className={`px-6 py-3 font-mono tabular-nums text-right font-medium ${
                          transaction.amount > 0 ? "amount-pos" : "amount-neg"
                        }`}
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount.toLocaleString("uk-UA")} ₴
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
