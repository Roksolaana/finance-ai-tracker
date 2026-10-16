import { ArrowUp, Info, Sparkles, X } from "lucide-react";
import { initialChatMessages, mockQuickPrompts } from "@finance/shared";
import { useUi } from "../context/UiContext";

export function AiChatPanel() {
  const { toggleChat } = useUi();

  return (
    <aside className="card my-4 mr-4 flex w-[360px] shrink-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-olive-tint text-olive">
            <Sparkles size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">AI-асистент</p>
          </div>
        </div>
        <button onClick={toggleChat} className="btn-icon size-8" aria-label="Сховати асистента">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {initialChatMessages.map((message) => (
          <div key={message.id} className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface-soft px-4 py-3 text-sm leading-relaxed text-ink-soft ring-1 ring-line-soft">
            {message.content}
          </div>
        ))}

        <div className="space-y-2 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Приклади запитів</p>
          {mockQuickPrompts.map((prompt) => (
            <div key={prompt} className="rounded-xl border border-dashed border-line px-3.5 py-2.5 text-xs text-muted">
              {prompt}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line-soft p-4">
        <div className="mb-3 flex gap-2 rounded-xl bg-gold-tint px-3 py-2.5 text-xs text-gold">
          <Info size={15} className="mt-px shrink-0" />
          Асистент запрацює після підключення серверної частини.
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-soft p-1.5 pl-3.5">
          <input disabled placeholder="Запитайте про свої витрати…" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
          <button disabled className="inline-flex size-9 items-center justify-center rounded-xl bg-line text-muted">
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
