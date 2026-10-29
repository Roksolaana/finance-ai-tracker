import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Info, RotateCcw, Sparkles, X } from "lucide-react";
import {
  createChatApi,
  chatGreeting,
  quickChips,
  quickPrompts,
  type ChatMessage,
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

// Та сама межа, що й у класах max-xl:/xl: (80rem): нижче панель — накладка.
const WIDE_LAYOUT = "(min-width: 80rem)";

function FoundTransactions({ items }: { items: Transaction[] }) {
  return (
    <div className="mt-2 w-[92%] space-y-2 rounded-2xl border border-dashed border-line p-3.5">
      <p className="eyebrow px-0.5 text-muted">Знайдені записи · {items.length}</p>
      {items.slice(0, 5).map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 text-[13px]">
          <CategoryIcon category={t.category} size={28} />
          <span className="min-w-0 flex-1 truncate text-ink-soft">{t.note ?? t.category}</span>
          <span className="shrink-0 font-mono font-medium">{formatMoney(t.amount)}</span>
        </div>
      ))}
      {items.length > 5 && <p className="px-0.5 text-xs text-muted">…і ще {items.length - 5}</p>}
    </div>
  );
}

export function AiChatPanel({ hidden = false }: { hidden?: boolean }) {
  const { toggleChat } = useUi();
  const [messages, setMessages] = useState<ChatMessage[]>(chatGreeting);
  const [found, setFound] = useState<Record<string, Transaction[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  // Поки історія не прийшла, надсилати не даємо: відповідь history() інакше
  // перезаписувала щойно поставлене питання і знайдені записи до нього.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const historyLoadingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkStatus = useCallback(() => {
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
  }, []);

  // Розмова зберігається на сервері, тож після перезавантаження сторінки
  // (і на телефоні) вона та сама.
  const loadHistory = useCallback(() => {
    if (historyLoadingRef.current) return;
    historyLoadingRef.current = true;
    setHistoryFailed(false);
    chatApi
      .history()
      .then((history) => {
        setMessages([...chatGreeting, ...history.messages]);
        setFound(history.transactions);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryFailed(true))
      .finally(() => {
        historyLoadingRef.current = false;
      });
  }, []);

  // Статус перевіряємо при кожному відкритті, а не лише при старті: сервер
  // міг піднятися чи отримати ключ, поки панель була закрита. Історію
  // довантажуємо, якщо минулого разу не вийшло.
  useEffect(() => {
    if (hidden) return;
    checkStatus();
    if (!historyLoaded) loadHistory();
    // historyLoaded навмисно не в залежностях: інакше успішне завантаження
    // історії ще раз смикало б status().
  }, [hidden, checkStatus, loadHistory]);

  // На вузькому вікні панель — накладка поверх сторінки: фокус переносимо в
  // неї, а при закритті повертаємо туди, де він був.
  useEffect(() => {
    if (hidden || window.matchMedia(WIDE_LAYOUT).matches) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const input = inputRef.current;
    (input && !input.disabled ? input : panelRef.current)?.focus();
    return () => previous?.focus();
  }, [hidden]);

  // Escape закриває накладку. Діалоги Radix самі обробляють Escape і
  // викликають preventDefault — тоді панель не чіпаємо, щоб одне натискання
  // не закрило і діалог, і асистента.
  useEffect(() => {
    if (hidden) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (window.matchMedia(WIDE_LAYOUT).matches) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      toggleChat();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hidden, toggleChat]);

  const canSend = !!enabled && historyLoaded && !sending;

  // Під час першого відкриття поле ще вимкнене (статус та історія в дорозі),
  // тож фокус стає на саму панель. Щойно поле оживає — переводимо його туди.
  useEffect(() => {
    if (canSend && document.activeElement === panelRef.current) inputRef.current?.focus();
  }, [canSend]);

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
    if (!question || !canSend) return;

    const outgoing: ChatMessage = {
      id: localId(),
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, outgoing]);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const reply = await chatApi.send(question);
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

  const promptsDisabled = !canSend;

  return (
    // Нижче 1280px колонка стискала дашборд до половини вікна,
    // тому там панель стає накладкою справа.
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="AI-асистент"
      hidden={hidden}
      className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l border-line-soft bg-surface-soft outline-none max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:shadow-pop"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-night text-olive-soft">
            <Sparkles size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-tight">Асистент</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
              <span className={`size-2 shrink-0 rounded-full ${enabled === false ? "bg-gold" : "bg-positive"}`} />
              відповідає лише за вашими записами
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > chatGreeting.length && (
            <button
              onClick={restart}
              disabled={sending}
              className="btn-icon size-10"
              aria-label="Почати розмову заново"
              title="Почати розмову заново"
            >
              <RotateCcw size={17} />
            </button>
          )}
          <button onClick={toggleChat} className="btn-icon size-10" aria-label="Сховати асистента">
            <X size={18} />
          </button>
        </div>
      </div>

      <div role="log" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => {
          return (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex flex-col items-start"}
            >
              <div
                className={
                  message.role === "user"
                    ? "max-w-[88%] whitespace-pre-line rounded-3xl rounded-br-lg bg-night px-4.5 py-3 text-sm leading-relaxed text-white"
                    : "max-w-[92%] whitespace-pre-line rounded-3xl rounded-bl-lg bg-surface px-4.5 py-3.5 text-sm leading-relaxed text-ink shadow-card ring-1 ring-line-soft"
                }
              >
                {message.content}
              </div>
              {found[message.id] && <FoundTransactions items={found[message.id]} />}
            </div>
          );
        })}

        {sending && (
          <p className="flex items-center gap-2 px-1 text-xs text-muted" role="status">
            <span className="size-1.5 animate-pulse rounded-full bg-olive" />
            Асистент шукає відповідь…
          </p>
        )}

        {messages.length === chatGreeting.length && !sending && (
          <div className="space-y-2 pt-2">
            <p className="eyebrow text-muted">Приклади запитів</p>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                disabled={promptsDisabled}
                className="block w-full cursor-pointer rounded-2xl border border-dashed border-line px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:border-olive-soft hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line-soft px-5 pb-5 pt-4">
        {enabled === false && (
          <div className="mb-3 flex gap-2 rounded-2xl bg-gold-tint px-3.5 py-3 text-xs text-gold">
            <Info size={15} className="mt-px shrink-0" />
            {statusFailed
              ? "Не вдалося звʼязатися із сервером. Асистент тимчасово недоступний."
              : "Асистент вимкнений: на сервері не задано ключ LLM."}
          </div>
        )}
        {historyFailed && (
          <p className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-gold-tint px-3.5 py-3 text-xs text-gold">
            Не вдалося завантажити попередню розмову.
            <button type="button" onClick={loadHistory} className="shrink-0 font-medium underline">
              Спробувати знову
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-2xl bg-negative-tint px-3.5 py-3 text-xs text-negative">
            {error}
          </p>
        )}
        {/* Короткі підказки лишаються й посеред розмови, а не лише на початку. */}
        {messages.length > chatGreeting.length && !sending && (
          <div className="mb-3 flex flex-wrap gap-2">
            {quickChips.map((chip) => (
              <button
                key={chip}
                onClick={() => send(chip)}
                disabled={promptsDisabled}
                className="cursor-pointer rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-ink transition-colors hover:border-olive-soft disabled:pointer-events-none disabled:opacity-60"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-4 shadow-card"
        >
          <label htmlFor="chat-input" className="sr-only">
            Запит до AI-асистента
          </label>
          <input
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!canSend}
            maxLength={1000}
            placeholder={historyLoaded ? "Запитайте про свої гроші…" : "Завантаження розмови…"}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!canSend || !input.trim()}
            aria-label="Надіслати"
            className="inline-flex size-11 items-center justify-center rounded-xl bg-olive text-white transition-colors hover:bg-olive-deep disabled:bg-line disabled:text-muted"
          >
            <ArrowUp size={18} />
          </button>
        </form>
      </div>
    </aside>
  );
}
