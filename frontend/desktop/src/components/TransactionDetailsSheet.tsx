import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Pencil, StickyNote, Tag, Trash2, X } from "lucide-react";
import { filterByMonth, monthKey } from "@finance/shared";
import { useTransactions } from "../context/TransactionsContext";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";
import { formatDate, formatDateTime, formatMoney, formatMonth } from "../lib/format";

export function TransactionDetailsSheet() {
  const { detailsId, closeDetails, openEditForm, openDetails, showToast, showError } = useUi();
  const { transactions, deleteTransaction, restoreTransaction } = useTransactions();
  const transaction = transactions.find((t) => t.id === detailsId);

  const related = transaction
    ? filterByMonth(transactions, monthKey(transaction.spent_at)).filter(
        (t) => t.category === transaction.category && t.id !== transaction.id,
      )
    : [];
  const relatedTotal = related.reduce((s, t) => s + Math.abs(t.amount), 0) + Math.abs(transaction?.amount ?? 0);

  const handleDelete = async () => {
    if (!transaction) return;
    try {
      const removed = await deleteTransaction(transaction.id);
      closeDetails();
      showToast(
        "Транзакцію видалено",
        removed
          ? {
              label: "Повернути",
              onClick: () => restoreTransaction(removed).catch(() => showError("Не вдалося повернути транзакцію")),
            }
          : undefined,
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Не вдалося видалити");
    }
  };

  return (
    <Dialog.Root open={!!transaction} onOpenChange={(open) => !open && closeDetails()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content className="fixed right-3 top-3 bottom-3 z-50 flex w-[420px] flex-col rounded-3xl bg-surface shadow-pop outline-none">
          {transaction && (
            <>
              <div className="flex items-center justify-between px-6 pt-6">
                <Dialog.Title className="text-sm font-medium text-muted">Деталі транзакції</Dialog.Title>
                <Dialog.Close className="btn-icon" aria-label="Закрити">
                  <X size={18} />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">Інформація про транзакцію</Dialog.Description>

              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="flex flex-col items-center py-7 text-center">
                  <CategoryIcon category={transaction.category} size={56} />
                  <p
                    className={`mt-4 font-display text-3xl font-semibold tracking-tight ${
                      transaction.amount > 0 ? "text-positive" : ""
                    }`}
                  >
                    {formatMoney(transaction.amount, { sign: true, decimals: 2 })}
                  </p>
                  <p className="mt-1 text-sm text-muted">{transaction.amount > 0 ? "Дохід" : "Витрата"}</p>
                </div>

                <dl className="divide-y divide-line-soft rounded-2xl bg-surface-soft px-4 ring-1 ring-line-soft">
                  <div className="flex items-center gap-3 py-3.5">
                    <Tag size={16} className="text-muted" />
                    <dt className="text-sm text-muted">Категорія</dt>
                    <dd className="ml-auto text-sm font-medium capitalize">{transaction.category}</dd>
                  </div>
                  <div className="flex items-center gap-3 py-3.5">
                    <CalendarDays size={16} className="text-muted" />
                    <dt className="text-sm text-muted">Дата</dt>
                    <dd className="ml-auto text-sm font-medium">{formatDateTime(transaction.spent_at)}</dd>
                  </div>
                  <div className="flex items-start gap-3 py-3.5">
                    <StickyNote size={16} className="mt-0.5 text-muted" />
                    <dt className="text-sm text-muted">Нотатка</dt>
                    <dd className="ml-auto max-w-[220px] text-right text-sm font-medium">
                      {transaction.note || <span className="text-muted">—</span>}
                    </dd>
                  </div>
                </dl>

                {transaction.amount < 0 && (
                  <div className="mt-6">
                    <p className="mb-1 text-sm font-semibold capitalize">
                      «{transaction.category}» за {formatMonth(monthKey(transaction.spent_at)).toLowerCase()}
                    </p>
                    <p className="mb-3 text-xs text-muted">
                      {related.length + 1} транзакцій на суму {formatMoney(relatedTotal)}
                    </p>
                    <ul className="space-y-1">
                      {related.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          <button
                            onClick={() => openDetails(t.id)}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-surface-soft"
                          >
                            <span className="truncate text-ink-soft">{t.note || "Без нотатки"}</span>
                            <span className="ml-3 shrink-0 text-xs text-muted">{formatDate(t.spent_at)}</span>
                            <span className="ml-3 w-20 shrink-0 text-right font-medium">{formatMoney(t.amount)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-t border-line-soft p-4">
                <button onClick={handleDelete} className="btn-danger">
                  <Trash2 size={16} />
                  Видалити
                </button>
                <button onClick={() => openEditForm(transaction)} className="btn-primary flex-1">
                  <Pencil size={16} />
                  Редагувати
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
