import { useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ApiError } from "@finance/shared";
import { KeyRound, LogOut, MonitorSmartphone, Trash2, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { formatMoney } from "../lib/format";
import { TreeRings } from "./Rings";
import { initialsOf } from "./TopBar";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-milk px-4 py-3.5">
      <p className="eyebrow text-[10px] text-muted">{label}</p>
      <p className="mt-1.5 truncate font-display text-[17px] font-semibold tracking-tight">{value}</p>
    </div>
  );
}

type SecurityMode = "password" | "logout-all" | "delete" | null;

/**
 * Пароль, сесії й видалення акаунта.
 *
 * Небезпечні дії не виконуються одним кліком: кнопка лише розгортає
 * підтвердження, а видалення ще й просить пароль — випадковий клік не має
 * стерти всі дані.
 */
function AccountSecurity({ onDone }: { onDone: () => void }) {
  const { changePassword, logoutAll, deleteAccount } = useAuth();
  const { showToast } = useUi();
  const [mode, setMode] = useState<SecurityMode>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (value: SecurityMode) => {
    setMode(mode === value ? null : value);
    setCurrent("");
    setNext("");
    setError(null);
  };

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (success) showToast(success);
      setMode(null);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не вдалося виконати дію. Спробуйте ще раз");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "password") {
      if (next.length < 8) {
        setError("Новий пароль має бути щонайменше 8 символів");
        return;
      }
      void run(() => changePassword(current, next), "Пароль змінено. Інші пристрої вийшли з акаунта");
    } else if (mode === "delete") {
      void run(() => deleteAccount(current));
    } else if (mode === "logout-all") {
      void run(logoutAll);
    }
  };

  const row = (value: Exclude<SecurityMode, null>, icon: ReactNode, label: string, danger = false) => (
    <button
      type="button"
      onClick={() => open(value)}
      aria-expanded={mode === value}
      className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors hover:bg-milk ${
        danger ? "text-negative" : "text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="mt-4 rounded-2xl border border-line p-1.5">
      {row("password", <KeyRound size={16} className="text-olive" />, "Змінити пароль")}
      {row("logout-all", <MonitorSmartphone size={16} className="text-olive" />, "Вийти на всіх пристроях")}
      {row("delete", <Trash2 size={16} />, "Видалити акаунт", true)}

      {mode && (
        <form onSubmit={submit} className="space-y-3 px-3 pb-3 pt-2">
          {mode === "logout-all" && (
            <p className="text-sm text-muted">Усі сесії, включно з цією, завершаться. Увійти можна буде тим самим паролем.</p>
          )}
          {mode === "delete" && (
            <p className="text-sm text-negative">
              Буде видалено акаунт і всі дані: операції, ліміти, розмову з асистентом. Скасувати це не можна.
            </p>
          )}
          {(mode === "password" || mode === "delete") && (
            <label className="block">
              <span className="label">{mode === "delete" ? "Пароль для підтвердження" : "Поточний пароль"}</span>
              <input
                type="password"
                className="input"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </label>
          )}
          {mode === "password" && (
            <label className="block">
              <span className="label">Новий пароль</span>
              <input
                type="password"
                className="input"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="щонайменше 8 символів"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className={`${mode === "password" ? "btn-primary" : "btn-danger"} h-10 w-full`}
          >
            {mode === "password" ? "Зберегти пароль" : mode === "delete" ? "Видалити назавжди" : "Вийти всюди"}
          </button>
        </form>
      )}
    </div>
  );
}

export function ProfileDialog() {
  const { profileOpen, setProfileOpen } = useUi();
  const { user, logout } = useAuth();
  const { transactions, monthStats } = useTransactions();

  const since = user
    ? new Date(user.created_at).toLocaleDateString("uk-UA", { month: "long", year: "numeric" })
    : "—";

  return (
    <Dialog.Root open={profileOpen} onOpenChange={setProfileOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] bg-surface shadow-pop outline-none">
          <div className="relative overflow-hidden bg-forest px-7 pb-7 pt-6 text-white">
            <TreeRings nets={[]} size={260} className="pointer-events-none absolute -right-20 -top-24 opacity-60" />
            <div className="relative flex items-start justify-between">
              <Dialog.Title className="eyebrow pt-2 text-olive-soft">Профіль</Dialog.Title>
              <Dialog.Close className="btn-icon text-white/70 hover:bg-white/10 hover:text-white" aria-label="Закрити">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Дані вашого акаунта</Dialog.Description>

            <div className="relative mt-4 flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-cream font-display text-xl font-semibold uppercase text-forest">
                {initialsOf(user?.display_name)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-[22px] font-semibold tracking-tight">{user?.display_name}</p>
                <p className="truncate text-sm text-white/70">{user?.email}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="У Кроні з" value={since} />
              <Stat label="Транзакцій" value={String(transactions.length)} />
              <Stat label="Баланс за весь час" value={monthStats ? formatMoney(monthStats.total_balance) : "—"} />
              <Stat
                label="За вибраний місяць"
                value={monthStats ? formatMoney(monthStats.balance, { sign: true }) : "—"}
              />
            </div>

            <AccountSecurity onDone={() => setProfileOpen(false)} />

            <button
              onClick={() => {
                setProfileOpen(false);
                logout();
              }}
              className="btn-ghost mt-4 h-12 w-full justify-center rounded-2xl text-negative hover:border-negative-tint hover:bg-negative-tint"
            >
              <LogOut size={16} />
              Вийти з акаунта
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
