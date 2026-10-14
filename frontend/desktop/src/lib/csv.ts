import type { Transaction } from "@finance/shared";

export function exportTransactionsToCsv(transactions: Transaction[]) {
  const header = ["Дата", "Категорія", "Нотатка", "Сума"];
  const rows = transactions.map((t) => [
    new Date(t.spent_at).toLocaleDateString("uk-UA"),
    t.category,
    t.note ?? "",
    t.amount.toString(),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  // BOM, щоб Excel коректно показував кирилицю
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
