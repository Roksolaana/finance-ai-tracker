import type { Transaction } from "@finance/shared";

// Excel з українською локаллю очікує «;» як розділювач списку та кому як
// десятковий знак. З комою й точкою він зсипав увесь рядок в одну клітинку,
// а суми читав як текст.
const DELIMITER = ";";

function cell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Текст, що починається з =, +, -, @ чи табуляції, Excel читає як формулу:
// нотатка «-знижка» показувалася як #NAME?, а вписана «=HYPERLINK(...)»
// спрацювала б. Апостроф попереду змушує сприйняти клітинку як текст.
// Суму так не обробляємо — вона мусить лишитися числом.
function textCell(value: string): string {
  return cell(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
}

export function exportTransactionsToCsv(transactions: Transaction[]) {
  const header = ["Дата", "Категорія", "Нотатка", "Сума"].map(textCell);
  const rows = transactions.map((t) => [
    textCell(new Date(t.spent_at).toLocaleDateString("uk-UA")),
    textCell(t.category),
    textCell(t.note ?? ""),
    cell(t.amount.toFixed(2).replace(".", ",")),
  ]);

  const csv = [header, ...rows].map((row) => row.join(DELIMITER)).join("\r\n");

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
