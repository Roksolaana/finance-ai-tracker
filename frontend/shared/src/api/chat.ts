import { API_URL } from "../constants";
import type { ChatMessage, Transaction } from "../types";
import { request } from "./client";

export interface ChatReply {
  message: ChatMessage;
  /** Записи, на яких побудована відповідь — щоб показати, звідки взялися числа. */
  transactions: Transaction[];
}

export interface ChatHistory {
  messages: ChatMessage[];
  /** Знайдені записи за id відповіді асистента. */
  transactions: Record<string, Transaction[]>;
}

const HISTORY_LIMIT = 10;

export function createChatApi(baseUrl: string = API_URL) {
  const root = `${baseUrl}/chat`;

  return {
    /** Чи заданий ключ LLM на сервері. Без нього поле вводу лишається вимкненим. */
    async status(): Promise<boolean> {
      const data = await request<{ enabled: boolean }>(`${root}/status`);
      return data.enabled;
    },
    async send(message: string, history: ChatMessage[]): Promise<ChatReply> {
      return request<ChatReply>(`${root}/`, {
        method: "POST",
        body: JSON.stringify({
          message,
          // Сервер усе одно бере лише кілька останніх, а схема обмежує довжину
          // списку — надсилати всю розмову немає сенсу й вона б її відхилила.
          history: history.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content })),
        }),
      });
    },
    /** Розмова зберігається на сервері — однакова на ноутбуці й телефоні. */
    async history(): Promise<ChatHistory> {
      return request<ChatHistory>(`${root}/history`);
    },
    async clearHistory(): Promise<void> {
      await request<void>(`${root}/history`, { method: "DELETE" });
    },
  };
}
