import { createContext, useContext, useEffect, useRef } from "react";
import type { Transaction, TransactionCategory } from "@finance/shared";

// Окремо від Navigator: екрани імпортують хуки звідси, а Navigator — екрани.
// Інакше виходив би цикл імпортів, і Expo показував би про нього попередження.

export type Route =
  | { name: "home" }
  | { name: "transactions"; category?: TransactionCategory; month?: string }
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
  /** Закриває конкретну сторінку, лише якщо вона ще зверху свого стека. */
  close: (entryId: number) => void;
  activeTab: TabKey;
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
/** Що екран знає про себе: глибина в стеку, чи видно його зараз, його id. */
export interface ScreenInfo {
  id: number;
  depth: number;
  visible: boolean;
}

export const ScreenContext = createContext<ScreenInfo>({ id: -1, depth: 0, visible: true });

export function useNav() {
  const value = useContext(NavContext);
  if (!value) throw new Error("useNav поза Navigator");
  return value;
}

/** Чи є куди повертатись зі сторінки — для кнопки «назад» у шапці. */
export function useCanGoBack() {
  return useContext(ScreenContext).depth > 0;
}

export function useScreen() {
  return useContext(ScreenContext);
}

/**
 * Перезавантажує екран після зміни даних, але лише коли його видно.
 *
 * Сховані вкладки лишаються змонтованими, і раніше кожне збереження змушувало
 * кожну з них заново тягнути дані — кілька повних списків на одну дію.
 * Тепер прихований екран лише запамʼятовує, що застарів.
 */
export function useReloadOnChange(reload: () => void) {
  const { dataVersion } = useNav();
  const { visible } = useScreen();
  const seen = useRef(dataVersion);
  useEffect(() => {
    if (!visible || seen.current === dataVersion) return;
    seen.current = dataVersion;
    reload();
  }, [visible, dataVersion, reload]);
}
