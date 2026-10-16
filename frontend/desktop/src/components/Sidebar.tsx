import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ChartPie, LayoutDashboard, LogOut, ReceiptText, RotateCcw, Sprout } from "lucide-react";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Огляд", icon: LayoutDashboard },
  { to: "/transactions", label: "Транзакції", icon: ReceiptText },
  { to: "/analytics", label: "Аналітика", icon: ChartPie },
];

export function Sidebar() {
  const { resetDemoData } = useTransactions();
  const { showToast } = useUi();
  const { user, logout } = useAuth();
  const [resetting, setResetting] = useState(false);

  // Перші літери імені: «Марія Коваль» → «МК», одне слово → одна літера.
  const initials = (user?.display_name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <aside className="flex w-60 shrink-0 flex-col px-4 py-6">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-olive text-white shadow-[0_6px_16px_-8px_rgb(59_71_38/0.8)]">
          <Sprout size={18} strokeWidth={2} />
        </span>
        <span className="font-display text-[17px] font-semibold tracking-tight">Крона</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all ${
                isActive
                  ? "bg-surface text-ink shadow-card [&_svg]:text-olive"
                  : "text-muted hover:bg-milk-deep hover:text-ink"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        disabled={resetting}
        onClick={async () => {
          if (!window.confirm("Видалити всі транзакції та заповнити базу демо-даними?")) return;
          // Операція довга (видалення + ~250 вставок), тому кнопка блокується:
          // повторний клік запускав би паралельне очищення.
          setResetting(true);
          try {
            await resetDemoData();
            showToast("Демо-дані завантажено");
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Не вдалося скинути дані");
          } finally {
            setResetting(false);
          }
        }}
        className="mb-4 flex h-10 items-center gap-2.5 rounded-xl px-3 text-xs font-medium text-muted transition-colors hover:bg-milk-deep hover:text-ink disabled:pointer-events-none disabled:opacity-50"
      >
        <RotateCcw size={15} className={resetting ? "animate-spin" : undefined} />
        {resetting ? "Завантаження…" : "Скинути демо-дані"}
      </button>

      <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-olive-tint text-xs font-semibold uppercase text-olive">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{user?.display_name}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
        </div>
        <button onClick={logout} className="btn-icon size-8 shrink-0" title="Вийти" aria-label="Вийти з акаунта">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
