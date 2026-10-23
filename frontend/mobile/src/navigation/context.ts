import { createContext, useContext } from "react";
import type { Transaction, TransactionCategory } from "@finance/shared";

// Окремо від Navigator: екрани імпортують хуки звідси, а Navigator — екрани.
// Інакше виходив би цикл імпортів, і Expo показував би про нього попередження.

export type Route =
  | { name: "home" }
  | { name: "transactions"; category?: TransactionCategory }
  | { name: "analytics" }
  | { name: "chat" }
  | { name: "transaction"; transaction: Transaction }
  | { name: "add"; kind?: "expense" | "income"; edit?: Transaction; onSaved?: (saved: Transaction) => void }
  | { name: "budgets" }
  | { name: "profile" };

export type TabKey = "home" | "transactions" | "analytics" | "chat";

export interface Toast {
  text: string;
  kind: "success" | "error";
  action?: { label: string; onPress: () => void };
}

export interface NavValue {
  push: (route: Route) => void;
  pop: () => void;
  switchTab: (tab: TabKey) => void;
  showToast: (toast: Toast) => void;
  /** Росте після кожної зміни даних — екрани перезавантажуються. */
  dataVersion: number;
  refresh: () => void;
  /** Відкриває асистента й одразу ставить питання (з підказок на головній). */
  ask: (question: string) => void;
  /** Питання, яке чекає на відправку, і як позначити його взятим. */
  pendingQuestion: string | null;
  takeQuestion: () => void;
}

export const NavContext = createContext<NavValue | null>(null);
export const DepthContext = createContext(0);

export function useNav() {
  const value = useContext(NavContext);
  if (!value) throw new Error("useNav поза Navigator");
  return value;
}

/** Чи є куди повертатись зі сторінки — для кнопки «назад» у шапці. */
export function useCanGoBack() {
  return useContext(DepthContext) > 0;
}
