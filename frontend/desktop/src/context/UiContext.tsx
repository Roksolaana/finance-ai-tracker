import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Transaction } from "@finance/shared";

export type FormState = { mode: "add" } | { mode: "edit"; transaction: Transaction } | null;

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
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
  dismissToast: (id: number) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<FormState>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const showToast = useCallback(
    (message: string, action?: Toast["action"]) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, message, action }]);
      setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast],
  );

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
      dismissToast,
    }),
    [form, detailsId, budgetsOpen, profileOpen, chatOpen, toasts, showToast, dismissToast],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}
