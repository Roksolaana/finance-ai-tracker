import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { EXPENSE_CATEGORIES, type BudgetLimits, type TransactionCategory } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";

export function BudgetsDialog() {
  const { budgetsOpen, setBudgetsOpen, showToast } = useUi();
  const { budgetLimits, setBudgetLimits } = useTransactions();
  const [draft, setDraft] = useState<Partial<Record<TransactionCategory, string>>>({});

  useEffect(() => {
    if (!budgetsOpen) return;
    const initial: Partial<Record<TransactionCategory, string>> = {};
    for (const c of EXPENSE_CATEGORIES) initial[c] = budgetLimits[c] ? String(budgetLimits[c]) : "";
    setDraft(initial);
  }, [budgetsOpen, budgetLimits]);

  const handleSave = () => {
    const limits: BudgetLimits = {};
    for (const c of EXPENSE_CATEGORIES) {
      const value = Number(draft[c]);
      if (value > 0) limits[c] = value;
    }
    setBudgetLimits(limits);
    setBudgetsOpen(false);
    showToast("Ліміти оновлено");
  };

  return (
    <Dialog.Root open={budgetsOpen} onOpenChange={setBudgetsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-7 shadow-pop outline-none">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold">Ліміти бюджету</Dialog.Title>
            <Dialog.Close className="btn-icon" aria-label="Закрити">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-5 text-sm text-muted">
            Місячний ліміт для кожної категорії. Залиште поле порожнім, щоб не відстежувати категорію.
          </Dialog.Description>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {EXPENSE_CATEGORIES.map((c) => (
              <div key={c} className="flex items-center gap-3">
                <CategoryIcon category={c} size={32} />
                <span className="flex-1 text-sm font-medium capitalize">{c}</span>
                <div className="relative w-36">
                  <input
                    inputMode="numeric"
                    value={draft[c] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value.replace(/\D/g, "") }))}
                    placeholder="без ліміту"
                    className="input h-9 pr-8 text-right"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">₴</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setBudgetsOpen(false)} className="btn-ghost">
              Скасувати
            </button>
            <button onClick={handleSave} className="btn-primary">
              Зберегти
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
