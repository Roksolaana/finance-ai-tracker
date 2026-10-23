import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { monthKey, shiftMonth } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { formatMonth } from "../lib/format";

export function MonthPicker() {
  const { selectedMonth, setSelectedMonth } = useTransactions();
  const current = monthKey(new Date());
  const isCurrent = selectedMonth === current;

  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface p-1 shadow-card ring-1 ring-line-soft">
      <button
        onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
        className="btn-icon size-11"
        aria-label="Попередній місяць"
      >
        <ChevronLeft size={17} />
      </button>
      <span className="min-w-36 text-center text-sm font-medium">{formatMonth(selectedMonth)}</span>
      <button
        onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
        disabled={isCurrent}
        className="btn-icon size-11 disabled:pointer-events-none disabled:opacity-30"
        aria-label="Наступний місяць"
      >
        <ChevronRight size={17} />
      </button>
      {/* Кнопка є завжди, лише вимикається: коли вона зʼявлялася й зникала,
          увесь рядок у шапці стрибав під курсором. */}
      <button
        onClick={() => setSelectedMonth(current)}
        disabled={isCurrent}
        className="ml-1 h-11 rounded-lg px-3 text-xs font-medium text-olive hover:bg-olive-tint disabled:pointer-events-none disabled:opacity-30"
      >
        Поточний
      </button>
    </div>
  );
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  showMonthPicker?: boolean;
}

export function TopBar({ title, subtitle, showMonthPicker = true }: TopBarProps) {
  const { openAddForm, chatOpen, toggleChat } = useUi();

  return (
    <header className="mb-6 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {showMonthPicker && <MonthPicker />}
        {/* З підписом, а не голою іконкою: панель тепер закрита за
            замовчуванням, і асистента треба було вміти знайти. */}
        <button
          onClick={toggleChat}
          aria-pressed={chatOpen}
          title={chatOpen ? "Сховати асистента" : "Показати асистента"}
          className={`btn-ghost ${chatOpen ? "border-olive-soft bg-olive-tint text-olive hover:bg-olive-tint" : ""}`}
        >
          <Sparkles size={16} />
          Асистент
        </button>
        <button onClick={openAddForm} className="btn-primary">
          <Plus size={17} />
          Додати
        </button>
      </div>
    </header>
  );
}
