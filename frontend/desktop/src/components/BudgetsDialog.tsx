import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { EXPENSE_CATEGORIES, type BudgetLimits, type TransactionCategory } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";

// Лишаємо цифри й лише перший десятковий розділювач. Раніше фільтр пропускав
// тільки цифри: «1500,50» зберігалося як 150050 ₴, а наявний ліміт 1500.5
// після будь-якого натискання клавіші ставав 15005.
function sanitizeLimit(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  const sep = cleaned.search(/[.,]/);
  if (sep === -1) return cleaned;
  return cleaned.slice(0, sep + 1) + cleaned.slice(sep + 1).replace(/[.,]/g, "");
}

export function BudgetsDialog() {
  const { budgetsOpen, setBudgetsOpen, showToast, showError } = useUi();
  const { budgetLimits, setBudgetLimits } = useTransactions();
  const [draft, setDraft] = useState<Partial<Record<TransactionCategory, string>>>({});
  const [error, setError] = useState<string | null>(null);

  // Ліміти в ref, щоб фонове оновлення даних (перезавантаження при фокусі вікна)
  // не перезаписувало те, що користувач уже набрав у відкритому діалозі.
  const latestLimits = useRef(budgetLimits);
  latestLimits.current = budgetLimits;

  useEffect(() => {
    if (!budgetsOpen) return;
    const initial: Partial<Record<TransactionCategory, string>> = {};
    for (const c of EXPENSE_CATEGORIES) {
      const limit = latestLimits.current[c];
      initial[c] = limit ? String(limit) : "";
    }
    setDraft(initial);
    setError(null);
  }, [budgetsOpen]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const limits: BudgetLimits = {};
    for (const c of EXPENSE_CATEGORIES) {
      const raw = draft[c] ?? "";
      if (!raw) continue;
      const value = Number(raw.replace(",", "."));
      if (Number.isNaN(value) || value <= 0) {
        setError(`Ліміт для «${c}» має бути більшим за нуль. Щоб не відстежувати категорію, залиште поле порожнім.`);
        return;
      }
      if (/[.,]\d{3,}$/.test(raw)) {
        setError(`Ліміт для «${c}»: вкажіть не більше двох знаків після коми.`);
        return;
      }
      limits[c] = value;
    }
    setError(null);
    setSaving(true);
    try {
      await setBudgetLimits(limits);
      setBudgetsOpen(false);
      showToast("Ліміти оновлено");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Не вдалося зберегти ліміти");
    } finally {
      setSaving(false);
    }
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
                    inputMode="decimal"
                    aria-label={`Місячний ліміт, категорія «${c}»`}
                    value={draft[c] ?? ""}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, [c]: sanitizeLimit(e.target.value) }));
                      setError(null);
                    }}
                    placeholder="без ліміту"
                    className="input h-9 pr-8 text-right"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">₴</span>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setBudgetsOpen(false)} className="btn-ghost">
              Скасувати
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
