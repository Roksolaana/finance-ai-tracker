import type { ChatMessage } from "../types";

export const mockChatHistory: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "Привіт! Я фінансовий асистент. Запитай щось числове — порахую через SQL; запитай щось за змістом нотатки — знайду через семантичний пошук.",
    timestamp: "2025-10-28T10:00:00Z",
  },
  {
    id: "m2",
    role: "user",
    content: "Скільки я витратив на каву цього місяця?",
    timestamp: "2025-10-28T10:01:00Z",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "Кава, жовтень: 1250,00 ₴. Витрати зросли на +12% порівняно з вереснем. Знайдено 5 транзакцій.",
    timestamp: "2025-10-28T10:01:02Z",
    tool_call: {
      name: "query_transactions",
      kind: "sql",
      duration_ms: 42,
    },
  },
  {
    id: "m4",
    role: "user",
    content: "Знайди витрати через стрес чи втому",
    timestamp: "2025-10-28T10:02:00Z",
  },
  {
    id: "m5",
    role: "assistant",
    content:
      "Загалом 645 ₴ на імпульсивні витрати через втому. Знайдено семантичним пошуком, сума — точним підрахунком.",
    timestamp: "2025-10-28T10:02:03Z",
    tool_call: {
      name: "hybrid_search_and_sum",
      kind: "hybrid",
      duration_ms: 118,
      matched_transaction_ids: ["t6", "t7"],
    },
  },
];

export const mockQuickPrompts: string[] = [
  "Скільки я витратив на каву цього місяця?",
  "Знайди витрати через стрес чи втому",
  "Яка категорія найбільша цього місяця?",
];
