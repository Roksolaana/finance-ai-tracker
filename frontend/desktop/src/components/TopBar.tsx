import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { monthKey, shiftMonth } from "@finance/shared";
import { useAuth } from "../context/AuthContext";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { formatMonth } from "../lib/format";
import { KronaMark } from "./Rings";

export function MonthPicker() {
  const { selectedMonth, setSelectedMonth } = useTransactions();
  const current = monthKey(new Date());
  const isCurrent = selectedMonth === current;

  return (
    <div className="flex h-12 items-center rounded-2xl bg-surface px-1 shadow-card ring-1 ring-line-soft">
      <button
        onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
        className="btn-icon size-10"
        aria-label="Попередній місяць"
      >
        <ChevronLeft size={17} />
      </button>
      {/* Повернення до поточного місяця — кліком по самій назві. Окрема
          кнопка, що зʼявлялася й зникала, змушувала шапку стрибати. */}
      <button
        onClick={() => setSelectedMonth(current)}
        disabled={isCurrent}
        title={isCurrent ? undefined : "Повернутися до поточного місяця"}
        className="min-w-36 rounded-lg px-2 text-center font-mono text-[13px] font-medium uppercase tracking-[0.12em] text-ink enabled:cursor-pointer enabled:text-olive enabled:hover:underline"
      >
        {formatMonth(selectedMonth)}
      </button>
      <button
        onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
        disabled={isCurrent}
        className="btn-icon size-10 disabled:pointer-events-none disabled:opacity-30"
        aria-label="Наступний місяць"
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

const navItems = [
  { to: "/", label: "Огляд" },
  { to: "/transactions", label: "Транзакції" },
  { to: "/analytics", label: "Аналітика" },
];

const tabClass = (active: boolean) =>
  `inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium transition-colors ${
    active ? "bg-night text-white shadow-sm" : "text-ink-soft hover:bg-milk hover:text-ink"
  }`;

/** Перші літери імені: «Марія Коваль» → «МК», одне слово → одна літера. */
export function initialsOf(name: string | undefined) {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function AppHeader() {
  const { user } = useAuth();
  const { openAddForm, chatOpen, toggleChat, budgetsOpen, setBudgetsOpen, setProfileOpen } = useUi();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  // Для всієї історії транзакцій місяць нічого не означає. Ховаємо через
  // invisible, а не прибираємо, щоб кнопки праворуч не зсувались.
  const pickerHidden = pathname === "/transactions" && params.get("period") === "all";

  return (
    <header className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
      <Link to="/" className="flex items-center gap-2.5 rounded-xl">
        <KronaMark size={40} />
        <span className="font-display text-[20px] font-semibold tracking-tight">Крона</span>
      </Link>

      <nav className="flex rounded-2xl bg-surface p-1 shadow-card ring-1 ring-line-soft">
        {navItems.map(({ to, label }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => tabClass(isActive && !budgetsOpen)}>
            {label}
          </NavLink>
        ))}
        {/* Окремої сторінки бюджетів немає — вкладка відкриває діалог лімітів. */}
        <button onClick={() => setBudgetsOpen(true)} aria-haspopup="dialog" className={tabClass(budgetsOpen)}>
          Бюджети
        </button>
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <div className={pickerHidden ? "invisible" : undefined}>
          <MonthPicker />
        </div>
        {/* З підписом, а не голою іконкою: панель закрита за замовчуванням,
            і асистента треба було вміти знайти. */}
        <button
          onClick={toggleChat}
          aria-pressed={chatOpen}
          title={chatOpen ? "Сховати асистента" : "Показати асистента"}
          className={`btn-ghost h-12 rounded-2xl px-5 shadow-card ${chatOpen ? "border-olive-soft bg-olive-tint text-olive hover:bg-olive-tint" : ""}`}
        >
          <Sparkles size={16} />
          Асистент
        </button>
        <button onClick={openAddForm} className="btn-primary h-12 rounded-2xl px-5">
          <Plus size={17} />
          Додати
        </button>
        <button
          onClick={() => setProfileOpen(true)}
          aria-label="Відкрити профіль"
          title={user?.display_name}
          className="inline-flex size-12 items-center justify-center rounded-2xl bg-olive-tint font-display text-sm font-semibold uppercase text-olive-deep transition-colors hover:bg-cream"
        >
          {initialsOf(user?.display_name)}
        </button>
      </div>
    </header>
  );
}

interface TopBarProps {
  title: string;
  subtitle?: string;
}

/** Заголовок сторінки під загальною шапкою. */
export function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-muted">{subtitle}</p>}
    </div>
  );
}
