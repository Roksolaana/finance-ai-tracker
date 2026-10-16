import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, LogOut, Mail, Receipt, Wallet, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { formatMoney } from "../lib/format";

function Row({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-milk-deep px-3.5 py-3">
      <Icon size={16} className="shrink-0 text-muted" />
      <span className="text-sm text-muted">{label}</span>
      <span className="ml-auto truncate text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

export function ProfileDialog() {
  const { profileOpen, setProfileOpen } = useUi();
  const { user, logout } = useAuth();
  const { transactions, monthStats } = useTransactions();

  const since = user
    ? new Date(user.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <Dialog.Root open={profileOpen} onOpenChange={setProfileOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-7 shadow-pop outline-none">
          <div className="mb-5 flex items-start justify-between">
            <Dialog.Title className="font-display text-lg font-semibold">Профіль</Dialog.Title>
            <Dialog.Close className="btn-icon" aria-label="Закрити">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Дані вашого акаунта</Dialog.Description>

          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-olive text-sm font-semibold uppercase text-white">
              {(user?.display_name ?? "")
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold">{user?.display_name}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Row icon={Mail} label="Email" value={user?.email ?? "—"} />
            <Row icon={CalendarDays} label="В застосунку з" value={since} />
            <Row icon={Receipt} label="Усього транзакцій" value={String(transactions.length)} />
            <Row
              icon={Wallet}
              label="Загальний баланс"
              value={monthStats ? formatMoney(monthStats.total_balance) : "—"}
            />
          </div>

          <button
            onClick={() => {
              setProfileOpen(false);
              logout();
            }}
            className="btn-ghost mt-6 w-full justify-center text-negative hover:bg-negative-tint"
          >
            <LogOut size={16} />
            Вийти з акаунта
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
