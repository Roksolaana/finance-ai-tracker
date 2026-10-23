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

export function createChatApi(baseUrl: string = API_URL) {
  const root = `${baseUrl}/chat`;

  return {
    /** Чи заданий ключ LLM на сервері. Без нього поле вводу лишається вимкненим. */
    async status(): Promise<boolean> {
      const data = await request<{ enabled: boolean }>(`${root}/status`);
      return data.enabled;
    },
    /**
     * Попередні репліки сервер бере з власної історії, а не від клієнта:
     * інакше можна було б підкинути вигадану відповідь «асистента».
     */
    async send(message: string): Promise<ChatReply> {
      return request<ChatReply>(`${root}/`, { method: "POST", body: JSON.stringify({ message }) });
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
