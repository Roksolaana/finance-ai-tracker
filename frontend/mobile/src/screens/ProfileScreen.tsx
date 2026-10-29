import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { monthKey, type MonthStats } from "@finance/shared";
import { statsApi } from "@/api";
import { useAuth } from "@/AuthContext";
import { money, signedMoney, type IconName } from "@/format";
import { useNav, useReloadOnChange } from "@/navigation/context";
import { TreeRings } from "@/rings";
import { Card, ScreenHeader, ui } from "@/ui";
import { fonts, theme } from "@/theme";

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const { push } = useNav();
  const [stats, setStats] = useState<MonthStats | null>(null);
  const since = user ? new Date(user.created_at).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }) : "";

  // Цифри в профілі — лише довідка: не прийшли, то показуємо прочерк.
  const load = useCallback(async () => {
    try {
      setStats(await statsApi.month(monthKey(new Date())));
    } catch {
      setStats(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useReloadOnChange(load);

  const confirmLogout = () =>
    Alert.alert("Вийти з акаунта?", "Дані лишаться на сервері, увійти можна будь-коли.", [
      { text: "Скасувати", style: "cancel" },
      { text: "Вийти", style: "destructive", onPress: logout },
    ]);

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Профіль" />
      <ScrollView contentContainerStyle={ui.content}>
        <View style={styles.hero}>
          <TreeRings nets={[]} size={220} style={styles.heroRings} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.display_name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.display_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {since ? <Text style={styles.since}>У КРОНІ З {since.toUpperCase()}</Text> : null}
        </View>

        <View style={styles.stats}>
          <Stat label="БАЛАНС ЗА ВЕСЬ ЧАС" value={stats ? money(stats.total_balance) : "—"} />
          <Stat label="ЦЬОГО МІСЯЦЯ" value={stats ? signedMoney(stats.balance) : "—"} />
        </View>

        {/* Аналітика й асистент — у нижньому меню; лімітів там немає, тож вони тут. */}
        <Card style={styles.menu}>
          <MenuRow icon="speedometer-outline" label="Ліміти бюджету" onPress={() => push({ name: "budgets" })} last />
        </Card>

        <Card style={styles.menu}>
          <MenuRow icon="log-out-outline" label="Вийти з акаунта" onPress={confirmLogout} danger last />
        </Card>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: theme.forest, borderRadius: 28, padding: 22, overflow: "hidden" },
  heroRings: { position: "absolute", right: -60, top: -70, opacity: 0.7 },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: theme.cream,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: { fontSize: 28, fontFamily: fonts.display, color: theme.forest },
  name: { fontSize: 24, fontFamily: fonts.display, color: "#fff", letterSpacing: -0.5 },
  email: { fontSize: 14, color: "rgba(255,255,255,0.72)", marginTop: 4 },
  since: { fontSize: 11, color: theme.oliveSoft, fontFamily: fonts.mono, letterSpacing: 1.4, marginTop: 14 },
  stats: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.lineSoft,
  },
  statLabel: { fontSize: 10, color: theme.muted, fontFamily: fonts.mono, letterSpacing: 1.2 },
  statValue: { fontSize: 17, color: theme.ink, fontFamily: fonts.display },
  menu: { paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: theme.lineSoft },
  pressed: { opacity: 0.6 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: theme.oliveTint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDanger: { backgroundColor: theme.negativeTint },
  rowLabel: { flex: 1, color: theme.ink, fontSize: 15 },
  danger: { color: theme.negative, fontWeight: "600" },
});
