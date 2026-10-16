import { useEffect, useRef, useState } from "react";
import { ArrowUp, Database, Info, Layers, Search, Sparkles, X } from "lucide-react";
import {
  createChatApi,
  initialChatMessages,
  mockQuickPrompts,
  type ChatMessage,
  type ToolKind,
  type Transaction,
} from "@finance/shared";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";
import { formatMoney } from "../lib/format";

const chatApi = createChatApi("/api/v1");

// Який шлях обробки дав відповідь — ядро теми роботи, тому показуємо явно.
const TOOL_LABELS: Record<ToolKind, { label: string; icon: typeof Database }> = {
  sql: { label: "SQL-агрегація", icon: Database },
  rag: { label: "Семантичний пошук", icon: Search },
  hybrid: { label: "Гібрид: пошук + SQL", icon: Layers },
};

function ToolBadge({ kind, durationMs }: { kind: ToolKind; durationMs: number }) {
  const { label, icon: Icon } = TOOL_LABELS[kind] ?? TOOL_LABELS.sql;
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-olive-tint px-2.5 py-1 text-[11px] font-medium text-olive">
      <Icon size={12} />
      {label}
      <span className="text-olive/60">· {(durationMs / 1000).toFixed(1)} с</span>
    </span>
  );
}

function FoundTransactions({ items }: { items: Transaction[] }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-dashed border-line p-2.5">
      <p className="px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        Знайдені записи ({items.length})
      </p>
      {items.slice(0, 5).map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-xs">
          <CategoryIcon category={t.category} size={22} />
          <span className="min-w-0 flex-1 truncate text-ink-soft">{t.note ?? t.category}</span>
          <span className="shrink-0 font-medium">{formatMoney(t.amount)}</span>
        </div>
      ))}
      {items.length > 5 && <p className="px-0.5 text-[11px] text-muted">…і ще {items.length - 5}</p>}
    </div>
  );
}

export function AiChatPanel() {
  const { toggleChat } = useUi();
  const [messages, setMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [found, setFound] = useState<Record<string, Transaction[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatApi
      .status()
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const outgoing: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    const history = messages;
    setMessages((prev) => [...prev, outgoing]);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const reply = await chatApi.send(question, [...history, outgoing]);
      setMessages((prev) => [...prev, reply.message]);
      if (reply.transactions.length) {
        setFound((prev) => ({ ...prev, [reply.message.id]: reply.transactions }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося отримати відповідь");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="card my-4 mr-4 flex w-[360px] shrink-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-olive-tint text-olive">
            <Sparkles size={16} />
          </span>
          <p className="text-sm font-semibold leading-tight">AI-асистент</p>
        </div>
        <button onClick={toggleChat} className="btn-icon size-8" aria-label="Сховати асистента">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[92%] rounded-2xl rounded-br-md bg-olive px-4 py-2.5 text-sm leading-relaxed text-white"
                  : "max-w-[92%] rounded-2xl rounded-bl-md bg-surface-soft px-4 py-3 text-sm leading-relaxed text-ink-soft ring-1 ring-line-soft"
              }
            >
              {message.content}
            </div>
            {message.tool_call && (
              <ToolBadge kind={message.tool_call.kind} durationMs={message.tool_call.duration_ms} />
            )}
            {found[message.id] && <FoundTransactions items={found[message.id]} />}
          </div>
        ))}

        {sending && (
          <p className="text-xs text-muted" role="status">
            Асистент шукає відповідь…
          </p>
        )}

        {messages.length === 1 && !sending && (
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Приклади запитів</p>
            {mockQuickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                disabled={!enabled || sending}
                className="block w-full rounded-xl border border-dashed border-line px-3.5 py-2.5 text-left text-xs text-muted transition-colors hover:border-olive-soft hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line-soft p-4">
        {enabled === false && (
          <div className="mb-3 flex gap-2 rounded-xl bg-gold-tint px-3 py-2.5 text-xs text-gold">
            <Info size={15} className="mt-px shrink-0" />
            Асистент вимкнений: на сервері не задано ключ LLM.
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-negative-tint px-3 py-2.5 text-xs text-negative">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-2xl border border-line bg-surface-soft p-1.5 pl-3.5"
        >
          <label htmlFor="chat-input" className="sr-only">
            Запит до AI-асистента
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!enabled || sending}
            maxLength={1000}
            placeholder="Запитайте про свої витрати…"
            className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!enabled || sending || !input.trim()}
            aria-label="Надіслати"
            className="inline-flex size-9 items-center justify-center rounded-xl bg-olive text-white transition-colors hover:bg-olive-deep disabled:bg-line disabled:text-muted"
          >
            <ArrowUp size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
