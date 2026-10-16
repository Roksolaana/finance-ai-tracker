import type { Transaction } from "@finance/shared";

// Excel з українською локаллю очікує «;» як розділювач списку та кому як
// десятковий знак. З комою й точкою він зсипав увесь рядок в одну клітинку,
// а суми читав як текст.
const DELIMITER = ";";

function cell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function exportTransactionsToCsv(transactions: Transaction[]) {
  const header = ["Дата", "Категорія", "Нотатка", "Сума"];
  const rows = transactions.map((t) => [
    new Date(t.spent_at).toLocaleDateString("uk-UA"),
    t.category,
    t.note ?? "",
    t.amount.toFixed(2).replace(".", ","),
  ]);

  const csv = [header, ...rows].map((row) => row.map(cell).join(DELIMITER)).join("\r\n");

  // BOM, щоб Excel коректно показував кирилицю
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `krona-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  // Firefox не реагує на click() по елементу, якого немає в документі, і не
  // встигає завантажити файл, якщо URL звільнити синхронно.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
