import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Transaction } from "@finance/shared";

export type FormState = { mode: "add" } | { mode: "edit"; transaction: Transaction } | null;

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  /** Помилки мають виглядати інакше, ніж «Збережено», — інакше їх не помічають. */
  tone: "success" | "error";
}

interface UiContextValue {
  form: FormState;
  openAddForm: () => void;
  openEditForm: (transaction: Transaction) => void;
  closeForm: () => void;
  detailsId: string | null;
  openDetails: (id: string) => void;
  closeDetails: () => void;
  budgetsOpen: boolean;
  setBudgetsOpen: (open: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  chatOpen: boolean;
  toggleChat: () => void;
  toasts: Toast[];
  showToast: (message: string, action?: Toast["action"]) => void;
  showError: (message: string) => void;
  dismissToast: (id: number) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

const CHAT_OPEN_KEY = "krona.chatOpen";

// localStorage може бути недоступним (приватне вікно, заблоковані дані сайту),
// тоді просто стартуємо із закритою панеллю.
function readChatOpen() {
  try {
    return localStorage.getItem(CHAT_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<FormState>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // За замовчуванням закрита: на ноутбуці відкрита панель забирала чверть
  // вікна ще до того, як людина взагалі захотіла щось запитати.
  const [chatOpen, setChatOpen] = useState(readChatOpen);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? "1" : "0");
    } catch {
      // Не запамʼятали — не страшно, наступного разу панель просто буде закрита.
    }
  }, [chatOpen]);

  const pushToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, ...toast }]);
      setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast],
  );

  const showToast = useCallback(
    (message: string, action?: Toast["action"]) => pushToast({ message, action, tone: "success" }),
    [pushToast],
  );
  const showError = useCallback((message: string) => pushToast({ message, tone: "error" }), [pushToast]);

  const value = useMemo<UiContextValue>(
    () => ({
      form,
      openAddForm: () => setForm({ mode: "add" }),
      openEditForm: (transaction) => {
        setDetailsId(null);
        setForm({ mode: "edit", transaction });
      },
      closeForm: () => setForm(null),
      detailsId,
      openDetails: setDetailsId,
      closeDetails: () => setDetailsId(null),
      budgetsOpen,
      setBudgetsOpen,
      profileOpen,
      setProfileOpen,
      chatOpen,
      toggleChat: () => setChatOpen((v) => !v),
      toasts,
      showToast,
      showError,
      dismissToast,
    }),
    [form, detailsId, budgetsOpen, profileOpen, chatOpen, toasts, showToast, showError, dismissToast],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}
