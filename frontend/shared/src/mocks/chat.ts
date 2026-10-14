import type { ChatMessage } from "../types";

export const initialChatMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "Привіт! Я фінансовий асистент. Запитай щось числове — порахую через SQL; запитай щось за змістом нотатки — знайду через семантичний пошук.",
    timestamp: new Date().toISOString(),
  },
];

export const mockQuickPrompts: string[] = [
  "Скільки я витратив на каву цього місяця?",
  "Знайди витрати через стрес чи втому",
  "Яка категорія найбільша цього місяця?",
];
