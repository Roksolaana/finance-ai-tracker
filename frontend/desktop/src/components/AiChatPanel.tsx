import { useEffect, useRef, useState } from "react";
import { ArrowUp, Database, Info, Layers, RotateCcw, Search, Sparkles, X } from "lucide-react";
import {
  NO_TOOL_INFO,
  ROUTE_INFO,
  createChatApi,
  chatGreeting,
  quickPrompts,
  type ChatMessage,
  type ToolKind,
  type Transaction,
} from "@finance/shared";
import { useUi } from "../context/UiContext";
import { CategoryIcon } from "./CategoryIcon";
import { formatMoney } from "../lib/format";

const chatApi = createChatApi("/api/v1");

// crypto.randomUUID доступний лише в захищеному контексті. Застосунок, відкритий
// за локальною IP-адресою (http://192.168.x.x:8000), таким не є, і виклик кидав
// помилку ще до появи повідомлення — кнопка «Надіслати» просто не працювала.
let localIdCounter = 0;
function localId(): string {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

const ROUTE_ICONS: Record<ToolKind, typeof Database> = {
  sql: Database,
  rag: Search,
  hybrid: Layers,
};

// Як отримано відповідь — відкривається кнопкою «i», щоб не заважати читати.
function HowAnswered({ message, foundCount }: { message: ChatMessage; foundCount: number }) {
  const call = message.tool_call;
  if (!call) {
    return <p className="mt-2 max-w-[92%] rounded-xl bg-olive-tint px-3 py-2.5 text-xs text-olive-deep">{NO_TOOL_INFO}</p>;
  }
  const route = ROUTE_INFO[call.kind] ?? ROUTE_INFO.sql;
  const Icon = ROUTE_ICONS[call.kind] ?? Database;
  return (
    <div className="mt-2 max-w-[92%] space-y-1 rounded-xl bg-olive-tint px-3 py-2.5 text-xs text-olive-deep">
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon size={13} />
        {route.title}
      </p>
      <ol className="list-decimal space-y-0.5 pl-4 leading-relaxed">
        {route.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="pt-1 text-[11px] text-olive">
        {call.name} · {(call.duration_ms / 1000).toFixed(1)} с · записів: {foundCount}
      </p>
    </div>
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

export function AiChatPanel({ hidden = false }: { hidden?: boolean }) {
  const { toggleChat } = useUi();
  const [messages, setMessages] = useState<ChatMessage[]>(chatGreeting);
  const [found, setFound] = useState<Record<string, Transaction[]>>({});
  const [opened, setOpened] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatApi
      .status()
      .then((value) => {
        setEnabled(value);
        setStatusFailed(false);
      })
      .catch(() => {
        // Недоступний сервер — не те саме, що невказаний ключ.
        setEnabled(false);
        setStatusFailed(true);
      });
    // Розмова зберігається на сервері, тож після перезавантаження сторінки
    // (і на телефоні) вона та сама.
    chatApi
      .history()
      .then((history) => {
        setMessages([...chatGreeting, ...history.messages]);
        setFound(history.transactions);
      })
      .catch(() => {});
  }, []);

  const restart = async () => {
    if (!window.confirm("Почати розмову заново? Поточна розмова зникне на всіх пристроях.")) return;
    try {
      await chatApi.clearHistory();
      setMessages(chatGreeting);
      setFound({});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося очистити розмову");
    }
  };

  useEffect(() => {
    if (hidden) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, sending, hidden]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const outgoing: ChatMessage = {
      id: localId(),
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
    <aside
      hidden={hidden}
      className="card my-4 mr-4 flex w-[360px] shrink-0 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-olive-tint text-olive">
            <Sparkles size={16} />
          </span>
          <p className="text-sm font-semibold leading-tight">AI-асистент</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > chatGreeting.length && (
            <button
              onClick={restart}
              disabled={sending}
              className="btn-icon size-8"
              aria-label="Почати розмову заново"
              title="Почати розмову заново"
            >
              <RotateCcw size={15} />
            </button>
          )}
          <button onClick={toggleChat} className="btn-icon size-8" aria-label="Сховати асистента">
            <X size={16} />
          </button>
        </div>
      </div>

      <div role="log" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[92%] whitespace-pre-line rounded-2xl rounded-br-md bg-olive px-4 py-2.5 text-sm leading-relaxed text-white"
                  : "max-w-[92%] whitespace-pre-line rounded-2xl rounded-bl-md bg-surface-soft px-4 py-3 text-sm leading-relaxed text-ink-soft ring-1 ring-line-soft"
              }
            >
              {message.content}
            </div>
            {message.role === "assistant" && !chatGreeting.some((m) => m.id === message.id) && (
              <button
                onClick={() => setOpened((current) => (current === message.id ? null : message.id))}
                aria-label="Як отримано відповідь"
                aria-expanded={opened === message.id}
                title="Як отримано відповідь"
                className={`mt-1.5 inline-flex size-5 items-center justify-center rounded-full border text-[11px] font-bold italic transition-colors ${
                  opened === message.id
                    ? "border-olive bg-olive text-white"
                    : "border-line text-muted hover:border-olive-soft hover:text-ink"
                }`}
              >
                i
              </button>
            )}
            {opened === message.id && (
              <HowAnswered message={message} foundCount={found[message.id]?.length ?? 0} />
            )}
            {found[message.id] && <FoundTransactions items={found[message.id]} />}
          </div>
        ))}

        {sending && (
          <p className="text-xs text-muted" role="status">
            Асистент шукає відповідь…
          </p>
        )}

        {messages.length === chatGreeting.length && !sending && (
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Приклади запитів</p>
            {quickPrompts.map((prompt) => (
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
            {statusFailed
              ? "Не вдалося звʼязатися із сервером. Асистент тимчасово недоступний."
              : "Асистент вимкнений: на сервері не задано ключ LLM."}
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
