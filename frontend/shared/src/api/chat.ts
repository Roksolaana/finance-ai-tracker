import { API_URL } from "../constants";
import type { ChatMessage, Transaction } from "../types";
import { request } from "./client";

export interface ChatReply {
  message: ChatMessage;
  /** Записи, на яких побудована відповідь — щоб показати, звідки взялися числа. */
  transactions: Transaction[];
}

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
          history: history.map(({ role, content }) => ({ role, content })),
        }),
      });
    },
  };
}
