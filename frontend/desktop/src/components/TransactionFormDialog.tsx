import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { EXPENSE_CATEGORIES, dayKey, monthKey, type TransactionCategory } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";

type Kind = "expense" | "income";

function combineDateWithTime(date: string, timeSource: Date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, timeSource.getHours(), timeSource.getMinutes()).toISOString();
}

export function TransactionFormDialog() {
  const { form, closeForm, showToast } = useUi();
  const { addTransaction, updateTransaction, setSelectedMonth } = useTransactions();
  const editing = form?.mode === "edit" ? form.transaction : null;

  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("їжа");
  const [date, setDate] = useState(dayKey(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!form) return;
    setError(null);
    if (editing) {
      setKind(editing.amount > 0 ? "income" : "expense");
      setAmount(String(Math.abs(editing.amount)));
      setCategory(editing.amount > 0 ? "їжа" : editing.category);
      setDate(dayKey(editing.spent_at));
      setNote(editing.note ?? "");
    } else {
      setKind("expense");
      setAmount("");
      setCategory("їжа");
      setDate(dayKey(new Date()));
      setNote("");
    }
  }, [form, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount.replace(",", "."));
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError("Вкажіть суму більшу за нуль");
      return;
    }
    if (date > dayKey(new Date())) {
      setError("Дата не може бути в майбутньому");
      return;
    }

    const input = {
      amount: kind === "income" ? parsed : -parsed,
      category: kind === "income" ? ("дохід" as const) : category,
      note: note.trim() || null,
      spent_at: combineDateWithTime(date, editing ? new Date(editing.spent_at) : new Date()),
    };

    try {
      if (editing) {
        await updateTransaction(editing.id, input);
        showToast("Зміни збережено");
      } else {
        await addTransaction(input);
        showToast(kind === "income" ? "Дохід додано" : "Витрату додано");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
      return;
    }
    setSelectedMonth(monthKey(input.spent_at));
    closeForm();
  };

  return (
    <Dialog.Root open={form !== null} onOpenChange={(open) => !open && closeForm()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-7 shadow-pop outline-none">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold">
              {editing ? "Редагувати транзакцію" : "Нова транзакція"}
            </Dialog.Title>
            <Dialog.Close className="btn-icon" aria-label="Закрити">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Форма транзакції</Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="segmented w-full [&>button]:flex-1">
              <button type="button" data-active={kind === "expense"} onClick={() => setKind("expense")}>
                Витрата
              </button>
              <button type="button" data-active={kind === "income"} onClick={() => setKind("income")}>
                Дохід
              </button>
            </div>

            <div>
              <label className="label" htmlFor="amount">Сума</label>
              <div className="relative">
                <input
                  id="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                    setError(null);
                  }}
                  placeholder="0"
                  className="input h-14 pr-10 text-2xl font-semibold"
                  autoFocus
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-muted">₴</span>
              </div>
            </div>

            {kind === "expense" && (
              <div>
                <span className="label">Категорія</span>
                <div className="grid grid-cols-3 gap-2">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium capitalize transition-all ${
                        category === c
                          ? "border-olive bg-olive-tint text-ink ring-2 ring-olive-tint"
                          : "border-line text-ink-soft hover:border-olive-soft"
                      }`}
                    >
                      <CategoryIcon category={c} size={26} />
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-[160px_1fr] gap-3">
              <div>
                <label className="label" htmlFor="date">Дата</label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  max={dayKey(new Date())}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setError(null);
                  }}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="note">Нотатка</label>
                <input
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={kind === "income" ? "Зарплата, стипендія…" : "Що і чому купили"}
                  className="input"
                />
              </div>
            </div>
            {kind === "expense" && (
              <p className="-mt-2 text-[11px] text-muted">
                Пишіть нотатку своїми словами — AI-асистент шукатиме витрати за змістом.
              </p>
            )}

            {error && <p className="rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeForm} className="btn-ghost">
                Скасувати
              </button>
              <button type="submit" className="btn-primary min-w-32">
                {editing ? "Зберегти" : "Додати"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
