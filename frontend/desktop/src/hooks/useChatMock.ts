import { useState } from "react";
import { initialChatMessages, type ChatMessage } from "@finance/shared";

// Тимчасова заміна useChat() зі Етапу 3 — композитор уже працює, але відповідь
// поки статична-заглушка, бо реального бекенду/LLM ще нема.
export function useChatMock() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialChatMessages);

  const sendMessage = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const placeholderReply: ChatMessage = {
      id: `local-${Date.now() + 1}`,
      role: "assistant",
      content:
        "Поки що я показую лише тестові дані — реальний SQL+RAG-пайплайн підключимо на наступному етапі.",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage, placeholderReply]);
  };

  return { messages, sendMessage };
}
