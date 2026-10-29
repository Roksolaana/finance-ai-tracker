import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, X } from "lucide-react";
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
