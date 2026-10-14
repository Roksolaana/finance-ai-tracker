import { useState } from "react";
import { mockQuickPrompts } from "@finance/shared";
import { useChatMock } from "../hooks/useChatMock";

export function AiChatPanel() {
  const { messages, sendMessage } = useChatMock();
  const [draft, setDraft] = useState("");

  const handleSend = () => {
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft("");
  };

  return (
    <aside className="ai-panel w-full lg:w-[360px] flex flex-col shrink-0">
      <div className="h-16 border-b border-c px-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="icon w-4 h-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="font-display font-semibold text-[14px] text-ink">AI-Асистент</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--positive)" }} />
          Онлайн
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="bubble-user rounded-xl rounded-tr-sm px-4 py-2.5 text-sm font-medium max-w-[85%]">
                  {message.content}
                </div>
              </div>
            );
          }

          return (
            <div key={message.id}>
              {message.tool_call && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono tool-badge mb-2">
                  <svg className="icon w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  {message.tool_call.name} · {message.tool_call.kind.toUpperCase()} · {message.tool_call.duration_ms} мс
                </div>
              )}
              <div className="bubble-assist rounded-xl px-4 py-3 text-sm text-ink-soft leading-relaxed">
                {message.content}
              </div>
            </div>
          );
        })}

        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider mb-2.5">Швидкі запити</p>
          {mockQuickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="quick-prompt w-full text-left rounded-lg px-3 py-2 text-xs"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-c" style={{ background: "var(--surface-soft)" }}>
        <div className="composer relative rounded-lg transition-all">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Задай питання асистенту..."
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted pl-3 pr-10 py-2.5 resize-none outline-none"
            style={{ minHeight: 40 }}
          />
          <button
            onClick={handleSend}
            className="absolute right-2 bottom-2 p-1 rounded-md text-muted hover:text-ink transition-colors"
          >
            <svg className="icon w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1">
          <span className="text-[10px] text-muted font-mono">2 звернення до LLM на запит</span>
          <span className="text-[10px] text-muted font-mono">⌘ Enter</span>
        </div>
      </div>
    </aside>
  );
}
