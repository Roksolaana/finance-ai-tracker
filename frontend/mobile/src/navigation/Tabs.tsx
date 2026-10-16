import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/theme";
import { OverviewScreen } from "@/screens/OverviewScreen";
import { AddScreen } from "@/screens/AddScreen";
import { FeedScreen } from "@/screens/FeedScreen";
import { ChatScreen } from "@/screens/ChatScreen";

type TabKey = "overview" | "add" | "feed" | "chat";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "overview", label: "Огляд", icon: "◱" },
  { key: "add", label: "Додати", icon: "+" },
  { key: "feed", label: "Транзакції", icon: "≡" },
  { key: "chat", label: "Асистент", icon: "✦" },
];

export function Tabs() {
  const [active, setActive] = useState<TabKey>("overview");
  const insets = useSafeAreaInsets();
  // Додані транзакції мають одразу зʼявлятися у стрічці та враховуватись
  // асистентом, тому перемальовуємо вкладки за спільним лічильником.
  const [dataVersion, setDataVersion] = useState(0);
  const refresh = () => setDataVersion((v) => v + 1);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {active === "overview" && <OverviewScreen dataVersion={dataVersion} />}
        {active === "add" && <AddScreen onSaved={refresh} />}
        {active === "feed" && <FeedScreen dataVersion={dataVersion} onChanged={refresh} />}
        {active === "chat" && <ChatScreen />}
      </View>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((tab) => {
          const selected = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActive(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              style={styles.tab}
            >
              <Text style={[styles.icon, selected && styles.activeText]}>{tab.icon}</Text>
              <Text style={[styles.label, selected && styles.activeText]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1 },
  bar: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.lineSoft,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  icon: { fontSize: 18, color: theme.muted, lineHeight: 22 },
  label: { fontSize: 11, color: theme.muted },
  activeText: { color: theme.olive, fontWeight: "600" },
});
