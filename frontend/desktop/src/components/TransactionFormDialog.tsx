import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles, X } from "lucide-react";
import {
  AUTO_CATEGORY_CONFIDENCE,
  EXPENSE_CATEGORIES,
  MOOD_TAGS,
  createTransactionsApi,
  dayKey,
  monthKey,
  type MoodTag,
  type TransactionCategory,
} from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";
import { formatMonth } from "../lib/format";

type Kind = "expense" | "income";

const parser = createTransactionsApi("/api/v1");

function combineDateWithTime(date: string, timeSource: Date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, timeSource.getHours(), timeSource.getMinutes()).toISOString();
}

export function TransactionFormDialog() {
  const { form, closeForm, showToast, showWarning } = useUi();
  const { addTransaction, updateTransaction, selectedMonth, setSelectedMonth } = useTransactions();
  const editing = form?.mode === "edit" ? form.transaction : null;

  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("їжа");
  const [date, setDate] = useState(dayKey(new Date()));
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<MoodTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [filled, setFilled] = useState(false);
  // Категорію обрала людина (чи вона прийшла з чернетки або редагування) —
  // тоді підказка за нотаткою її вже не перебиває.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [suggested, setSuggested] = useState<TransactionCategory | null>(null);
  const [autoCategory, setAutoCategory] = useState(false);

  useEffect(() => {
    if (!form) return;
    setError(null);
    setDescription("");
    setFilled(false);
    setCategoryTouched(Boolean(editing));
    setSuggested(null);
    setAutoCategory(false);
    if (editing) {
      setKind(editing.amount > 0 ? "income" : "expense");
      setAmount(String(Math.abs(editing.amount)));
      setCategory(editing.amount > 0 ? "їжа" : editing.category);
      setDate(dayKey(editing.spent_at));
      setNote(editing.note ?? "");
      setTags(editing.tags);
    } else {
      setKind("expense");
      setAmount("");
      setCategory("їжа");
      setDate(dayKey(new Date()));
      setNote("");
      setTags([]);
    }
  }, [form, editing]);

  // Чернетка лише заповнює поля — зберігає людина сама, перевіривши їх.
  const fillFromDescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsing || !description.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const draft = await parser.parse(description);
      const income = draft.amount !== null && draft.amount > 0;
      setKind(income ? "income" : "expense");
      if (draft.amount !== null) setAmount(String(Math.abs(draft.amount)));
      if (!income && draft.category !== "дохід") setCategory(draft.category);
      setDate(dayKey(draft.spent_at));
      setNote(draft.note ?? "");
      setTags(draft.tags);
      setCategoryTouched(true);
      setFilled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося розібрати опис");
    } finally {
      setParsing(false);
    }
  };

  // Підказка категорії за нотаткою: kNN по власних записах, без LLM.
  useEffect(() => {
    if (!form || editing || kind !== "expense" || categoryTouched || note.trim().length < 3) {
      setSuggested(null);
      return;
    }
    let cancelled = false;
    // Пауза, щоб не питати сервер на кожну літеру.
    const timer = setTimeout(async () => {
      try {
        const hint = await parser.suggestCategory(note);
        if (cancelled || !hint.category || hint.category === "дохід") return;
        if (hint.confidence >= AUTO_CATEGORY_CONFIDENCE) {
          setCategory(hint.category);
          setAutoCategory(true);
          setSuggested(null);
        } else {
          setSuggested(hint.category);
        }
      } catch {
        // Підказка — дрібна зручність; без неї форма працює як раніше.
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form, editing, kind, categoryTouched, note]);

  const pickCategory = (value: TransactionCategory) => {
    setCategory(value);
    setCategoryTouched(true);
    setAutoCategory(false);
    setSuggested(null);
  };

  const toggleTag = (tag: MoodTag) =>
    setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Без цього подвійний клік створював два однакові записи.
    if (saving) return;
    // «1,000» раніше читалося як 1 ₴, хоча людина, найімовірніше, мала на
    // увазі тисячу. Вгадувати не беремося: кома з рівно трьома цифрами після
    // неї чи кілька розділювачів — просимо записати суму без розділювачів тисяч.
    if ((amount.match(/[.,]/g) ?? []).length > 1 || /^\d+,\d{3}$/.test(amount)) {
      setError("Запишіть суму без розділювачів тисяч, наприклад 1000 або 1000,50");
      return;
    }
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
      tags,
      spent_at: combineDateWithTime(date, editing ? new Date(editing.spent_at) : new Date()),
    };

    setSaving(true);
    let warning: string | null = null;
    try {
      if (editing) {
        await updateTransaction(editing.id, input);
      } else {
        warning = (await addTransaction(input))?.message ?? null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
      return;
    } finally {
      setSaving(false);
    }

    const done = editing ? "Зміни збережено" : kind === "income" ? "Дохід додано" : "Витрату додано";
    // Раніше запис заднім числом мовчки перемикав увесь застосунок на інший
    // місяць. Тепер лишаємося, де були, і лише кажемо, куди потрапив запис.
    const savedMonth = monthKey(input.spent_at);
    if (savedMonth === selectedMonth) {
      showToast(done);
    } else {
      showToast(`${done} — запис потрапив у ${formatMonth(savedMonth).toLowerCase()}`, {
        label: "Перейти",
        onClick: () => setSelectedMonth(savedMonth),
      });
    }
    // Після підтвердження збереження: попередження важливіше, тож воно останнє.
    if (warning) showWarning(warning);
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

          {!editing && (
            <form onSubmit={fillFromDescription} className="mb-5">
              <label className="label" htmlFor="describe">Опишіть витрату</label>
              <div className="flex gap-2">
                <input
                  id="describe"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setFilled(false);
                  }}
                  placeholder="вчора таксі 230, бо проспала"
                  className="input"
                  maxLength={500}
                />
                <button type="submit" disabled={parsing || !description.trim()} className="btn-ghost shrink-0">
                  <Sparkles size={15} className="text-olive" />
                  {parsing ? "Розбираю…" : "Заповнити"}
                </button>
              </div>
              {filled && <p className="mt-1.5 text-[11px] text-muted">Поля заповнено — перевірте й натисніть «Додати».</p>}
            </form>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="segmented w-full [&>button]:flex-1" role="group" aria-label="Тип транзакції">
              <button
                type="button"
                data-active={kind === "expense"}
                aria-pressed={kind === "expense"}
                onClick={() => setKind("expense")}
              >
                Витрата
              </button>
              <button
                type="button"
                data-active={kind === "income"}
                aria-pressed={kind === "income"}
                onClick={() => setKind("income")}
              >
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
                <span className="label" id="category-label">Категорія</span>
                <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="category-label">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={category === c}
                      onClick={() => pickCategory(c)}
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
                {autoCategory && (
                  <p className="mt-1.5 text-[11px] text-muted">Категорію підставлено за схожими записами — змініть, якщо не так.</p>
                )}
                {suggested && suggested !== category && (
                  <button
                    type="button"
                    onClick={() => pickCategory(suggested)}
                    className="mt-1.5 text-[11px] font-medium text-olive hover:underline"
                  >
                    Схоже на «{suggested}» — обрати
                  </button>
                )}
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

            <div>
              <span className="label" id="tags-label">Настрій</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="tags-label">
                {MOOD_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={tags.includes(tag)}
                    onClick={() => toggleTag(tag)}
                    className={`chip border transition-colors ${
                      tags.includes(tag)
                        ? "border-olive bg-olive-tint text-ink"
                        : "border-line text-ink-soft hover:border-olive-soft"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="rounded-xl bg-negative-tint px-3 py-2 text-sm text-negative">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeForm} className="btn-ghost">
                Скасувати
              </button>
              <button type="submit" disabled={saving} className="btn-primary min-w-32 disabled:opacity-60">
                {saving ? "Збереження…" : editing ? "Зберегти" : "Додати"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
