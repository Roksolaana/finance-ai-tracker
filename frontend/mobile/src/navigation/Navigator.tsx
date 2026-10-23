import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NavContext, ScreenContext, type Route, type TabKey, type Toast } from "@/navigation/context";
import type { IconName } from "@/format";
import { theme } from "@/theme";
import { HomeScreen } from "@/screens/HomeScreen";
import { TransactionsScreen } from "@/screens/TransactionsScreen";
import { TransactionScreen } from "@/screens/TransactionScreen";
import { AddScreen } from "@/screens/AddScreen";
import { AnalyticsScreen } from "@/screens/AnalyticsScreen";
import { BudgetsScreen } from "@/screens/BudgetsScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { ChatScreen } from "@/screens/ChatScreen";

/*
 * Власна навігація замість бібліотеки: expo-router уже ламав застосунок у
 * Expo Go. Кожна вкладка має свій стек сторінок, і всі вони лишаються
 * змонтованими — введене в полі не губиться при переході на іншу вкладку.
 */

const TABS: { key: TabKey; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: "home", label: "Головна", icon: "home-outline", iconActive: "home" },
  { key: "transactions", label: "Операції", icon: "list-outline", iconActive: "list" },
  { key: "analytics", label: "Аналітика", icon: "pie-chart-outline", iconActive: "pie-chart" },
  { key: "chat", label: "Асистент", icon: "sparkles-outline", iconActive: "sparkles" },
];

function renderRoute(route: Route) {
  switch (route.name) {
    case "home":
      return <HomeScreen />;
    case "transactions":
      return <TransactionsScreen category={route.category} month={route.month} />;
    case "analytics":
      return <AnalyticsScreen />;
    case "chat":
      return <ChatScreen />;
    case "transaction":
      return <TransactionScreen transaction={route.transaction} />;
    case "add":
      return <AddScreen kind={route.kind} edit={route.edit} onSaved={route.onSaved} />;
    case "budgets":
      return <BudgetsScreen />;
    case "profile":
      return <ProfileScreen />;
  }
}

// Кожна відкрита сторінка має власний id: інакше після «назад» і відкриття
// іншої операції React перевикористав би старий екран з її даними.
interface Entry {
  id: number;
  route: Route;
}

let nextId = 4;

const ROOTS: Record<TabKey, Entry[]> = {
  home: [{ id: 0, route: { name: "home" } }],
  transactions: [{ id: 1, route: { name: "transactions" } }],
  analytics: [{ id: 2, route: { name: "analytics" } }],
  chat: [{ id: 3, route: { name: "chat" } }],
};

export function Navigator() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TabKey>("home");
  const [stacks, setStacks] = useState<Record<TabKey, Entry[]>>(ROOTS);
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Через ref, а не залежність: інакше всі функції навігації мінялись би з
  // кожним перемиканням вкладки й перемальовували б усі змонтовані екрани.
  const activeRef = useRef(active);
  activeRef.current = active;

  const push = useCallback((route: Route) => {
    const tab = activeRef.current;
    const entry = { id: nextId++, route };
    setStacks((prev) => ({ ...prev, [tab]: [...prev[tab], entry] }));
  }, []);
  const pop = useCallback(() => {
    const tab = activeRef.current;
    setStacks((prev) => (prev[tab].length > 1 ? { ...prev, [tab]: prev[tab].slice(0, -1) } : prev));
  }, []);
  // Форма після збереження закриває саме себе. Простий pop() закрив би й
  // сторінку під нею, якщо людина вже встигла натиснути «назад».
  const close = useCallback((entryId: number) => {
    setStacks((prev) => {
      for (const tab of Object.keys(prev) as TabKey[]) {
        const stack = prev[tab];
        if (stack.length > 1 && stack[stack.length - 1].id === entryId) {
          return { ...prev, [tab]: stack.slice(0, -1) };
        }
      }
      return prev;
    });
  }, []);
  const switchTab = useCallback((tab: TabKey) => {
    // Повторне натискання на активну вкладку повертає на її початок.
    if (tab === activeRef.current) setStacks((prev) => ({ ...prev, [tab]: ROOTS[tab] }));
    setActive(tab);
  }, []);
  const refresh = useCallback(() => setDataVersion((v) => v + 1), []);

  const showToast = useCallback(
    (next: Toast) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(next);
      toastOpacity.setValue(0);
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => setToast(null), next.action ? 5000 : 2800);
    },
    [toastOpacity],
  );

  // Системна кнопка «назад» на Android: спершу закриває сторінку, потім
  // повертає на головну, і лише тоді виходить із застосунку.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stacks[active].length > 1) {
        pop();
        return true;
      }
      if (active !== "home") {
        setActive("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stacks, active, pop]);

  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const ask = useCallback((question: string) => {
    setPendingQuestion(question);
    setActive("chat");
  }, []);
  const takeQuestion = useCallback(() => setPendingQuestion(null), []);

  const value = useMemo(
    () => ({
      push,
      pop,
      close,
      activeTab: active,
      switchTab,
      showToast,
      dataVersion,
      refresh,
      ask,
      pendingQuestion,
      takeQuestion,
    }),
    [push, pop, close, active, switchTab, showToast, dataVersion, refresh, ask, pendingQuestion, takeQuestion],
  );

  const top = stacks[active][stacks[active].length - 1].route;
  // На формі клавіатура й так закриває низ; панель лише відволікає.
  const showBar = top.name !== "add";

  return (
    <NavContext.Provider value={value}>
      <View style={styles.root}>
        {(Object.keys(stacks) as TabKey[]).map((tab) =>
          stacks[tab].map((entry, depth) => {
            const visible = tab === active && depth === stacks[tab].length - 1;
            return (
              <View
                key={entry.id}
                style={[StyleSheet.absoluteFill, !visible && styles.hidden]}
                pointerEvents={visible ? "auto" : "none"}
              >
                <ScreenInfoProvider id={entry.id} depth={depth} visible={visible}>
                  {renderRoute(entry.route)}
                </ScreenInfoProvider>
              </View>
            );
          }),
        )}
      </View>

      {toast && (
        <Animated.View
          style={[
            styles.toast,
            toast.kind === "error" && styles.toastError,
            { bottom: (showBar ? 64 : 12) + insets.bottom, opacity: toastOpacity },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name={toast.kind === "error" ? "alert-circle" : "checkmark-circle"}
            size={20}
            color={toast.kind === "error" ? "#F4B4A4" : "#C9D6A6"}
          />
          <Text style={styles.toastText}>{toast.text}</Text>
          {toast.action && (
            <Pressable
              onPress={() => {
                toast.action?.onPress();
                setToast(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.toastAction}>{toast.action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {showBar && (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {TABS.slice(0, 2).map((tab) => (
            <TabButton key={tab.key} tab={tab} selected={tab.key === active} onPress={() => switchTab(tab.key)} />
          ))}
          <View style={styles.addSlot}>
            <Pressable
              onPress={() => push({ name: "add" })}
              accessibilityRole="button"
              accessibilityLabel="Додати операцію"
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={30} color="#fff" />
            </Pressable>
          </View>
          {TABS.slice(2).map((tab) => (
            <TabButton key={tab.key} tab={tab} selected={tab.key === active} onPress={() => switchTab(tab.key)} />
          ))}
        </View>
      )}
    </NavContext.Provider>
  );
}

// Окремий компонент, щоб обʼєкт контексту не створювався заново на кожен рендер.
function ScreenInfoProvider({
  id,
  depth,
  visible,
  children,
}: {
  id: number;
  depth: number;
  visible: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ id, depth, visible }), [id, depth, visible]);
  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}

function TabButton({
  tab,
  selected,
  onPress,
}: {
  tab: (typeof TABS)[number];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={tab.label}
      style={styles.tab}
    >
      <Ionicons name={selected ? tab.iconActive : tab.icon} size={23} color={selected ? theme.olive : theme.muted} />
      <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  hidden: { display: "none" },
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.lineSoft,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 48 },
  tabLabel: { fontSize: 11, color: theme.muted },
  tabLabelActive: { color: theme.olive, fontWeight: "600" },
  addSlot: { flex: 1, alignItems: "center", justifyContent: "flex-end", minHeight: 48 },
  addButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.olive,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    shadowColor: theme.oliveDeep,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.oliveDeep,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toastError: { backgroundColor: "#6E2A1B" },
  toastText: { flex: 1, color: "#fff", fontSize: 14 },
  toastAction: { color: "#E3EBC8", fontWeight: "700", fontSize: 14 },
});
