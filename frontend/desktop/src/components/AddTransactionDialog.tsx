import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CATEGORIES, type TransactionCategory } from "@finance/shared";

type TransactionKind = "expense" | "income";

const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c !== "дохід");

interface AddTransactionDialogProps {
  onAdd: (input: {
    amount: number;
    category: TransactionCategory;
    note: string | null;
    spent_at: string;
  }) => void;
}

export function AddTransactionDialog({ onAdd }: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TransactionCategory>(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) return;

    onAdd({
      amount: kind === "income" ? parsed : -parsed,
      category: kind === "income" ? "дохід" : category,
      note: note.trim() || null,
      spent_at: new Date().toISOString(),
    });

    setAmount("");
    setNote("");
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="btn-primary inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg">
          <svg className="icon w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M12 4v16m8-8H4" />
          </svg>
          Транзакція
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="card fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] p-6">
          <Dialog.Title className="font-display text-base font-semibold text-ink mb-4">
            Нова транзакція
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex rounded-lg overflow-hidden border border-c">
              <button
                type="button"
                onClick={() => setKind("expense")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  kind === "expense" ? "btn-primary" : "bg-surface text-ink-soft"
                }`}
              >
                Витрата
              </button>
              <button
                type="button"
                onClick={() => setKind("income")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  kind === "income" ? "btn-primary" : "bg-surface text-ink-soft"
                }`}
              >
                Дохід
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted block mb-1.5">Сума</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="250.00"
                className="input-field w-full rounded-md px-3 py-2 text-sm"
                autoFocus
              />
            </div>

            {kind === "expense" && (
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Категорія</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                  className="input-field w-full rounded-md px-3 py-2 text-sm capitalize"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted block mb-1.5">Нотатка</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Обід у кафе з друзями"
                className="input-field w-full rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="btn-ghost px-3.5 py-2 rounded-lg text-sm font-medium">
                  Скасувати
                </button>
              </Dialog.Close>
              <button type="submit" className="btn-primary px-3.5 py-2 rounded-lg text-sm font-medium">
                Зберегти
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
