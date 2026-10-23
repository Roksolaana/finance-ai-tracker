import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { API_BASE_URL } from "@/api";
import { useAuth } from "@/AuthContext";
import type { IconName } from "@/format";
import { useNav } from "@/navigation/context";
import { Card, ScreenHeader, ui } from "@/ui";
import { theme } from "@/theme";

function MenuRow({
  icon,
  label,
  onPress,
  danger,
  last,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? theme.negative : theme.olive} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={theme.muted} />}
    </Pressable>
  );
}

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const { push, switchTab } = useNav();
  const since = user ? new Date(user.created_at).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }) : "";

  const confirmLogout = () =>
    Alert.alert("Вийти з акаунта?", "Дані лишаться на сервері, увійти можна будь-коли.", [
      { text: "Скасувати", style: "cancel" },
      { text: "Вийти", style: "destructive", onPress: logout },
    ]);

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Профіль" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.display_name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.display_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {since ? <Text style={styles.since}>У Кроні з {since}</Text> : null}
        </Card>

        <Card style={styles.menu}>
          <MenuRow icon="speedometer-outline" label="Ліміти бюджету" onPress={() => push({ name: "budgets" })} />
          <MenuRow icon="pie-chart-outline" label="Аналітика" onPress={() => switchTab("analytics")} />
          <MenuRow icon="sparkles-outline" label="AI-асистент" onPress={() => switchTab("chat")} last />
        </Card>

        <Card style={styles.menu}>
          <MenuRow icon="log-out-outline" label="Вийти з акаунта" onPress={confirmLogout} danger last />
        </Card>

        {/* Адреса сервера потрібна лише під час розробки. */}
        {__DEV__ && <Text style={styles.server}>Сервер: {API_BASE_URL}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 4, paddingVertical: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.oliveTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: { fontSize: 30, fontWeight: "700", color: theme.oliveDeep },
  name: { fontSize: 20, fontWeight: "700", color: theme.ink },
  email: { fontSize: 14, color: theme.inkSoft },
  since: { fontSize: 13, color: theme.inkSoft, marginTop: 6 },
  menu: { paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: theme.lineSoft },
  pressed: { opacity: 0.6 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.oliveTint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: theme.negativeTint },
  rowLabel: { flex: 1, color: theme.ink, fontSize: 15 },
  danger: { color: theme.negative, fontWeight: "600" },
  server: { color: theme.muted, fontSize: 12, textAlign: "center" },
});
