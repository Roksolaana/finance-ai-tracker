import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORY_COLORS, EXPENSE_CATEGORIES, type TransactionCategory } from "@finance/shared";
import { transactionsApi } from "@/api";
import { useAuth } from "@/AuthContext";
import { theme } from "@/theme";

type Kind = "expense" | "income";

export function AddScreen({ onSaved }: { onSaved: () => void }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("їжа");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    setError(null);
    setSaved(null);
    const parsed = Number(amount.replace(",", "."));
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError("Вкажіть суму більшу за нуль");
      return;
    }

    setSaving(true);
    try {
      await transactionsApi.create({
        amount: kind === "income" ? parsed : -parsed,
        category: kind === "income" ? "дохід" : category,
        note: note.trim() || null,
        spent_at: new Date().toISOString(),
      });
      setAmount("");
      setNote("");
      setSaved(kind === "income" ? "Дохід додано" : "Витрату додано");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Вітаю, {user?.display_name?.split(" ")[0]}</Text>
            <Text style={styles.title}>Нова транзакція</Text>
          </View>
          <Pressable onPress={logout} accessibilityRole="button" accessibilityLabel="Вийти з акаунта">
            <Text style={styles.logout}>Вийти</Text>
          </Pressable>
        </View>

        <View style={styles.segmented}>
          {([
            ["expense", "Витрата"],
            ["income", "Дохід"],
          ] as const).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setKind(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === value }}
              style={[styles.segment, kind === value && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, kind === value && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.amountRow}>
          <TextInput
            value={amount}
            onChangeText={(text) => {
              setAmount(text.replace(/[^\d.,]/g, ""));
              setError(null);
            }}
            placeholder="0"
            placeholderTextColor={theme.muted}
            keyboardType="decimal-pad"
            style={styles.amount}
            accessibilityLabel="Сума"
          />
          <Text style={styles.currency}>₴</Text>
        </View>

        {kind === "expense" && (
          <View style={styles.section}>
            <Text style={styles.label}>Категорія</Text>
            <View style={styles.chips}>
              {EXPENSE_CATEGORIES.map((item) => {
                const selected = item === category;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.chip,
                      selected && { backgroundColor: CATEGORY_COLORS[item], borderColor: CATEGORY_COLORS[item] },
                    ]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Нотатка</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Кава з собою перед парою"
            placeholderTextColor={theme.muted}
            style={styles.input}
            maxLength={1000}
          />
        </View>

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {saved && (
          <Text style={styles.success} accessibilityRole="alert">
            {saved}
          </Text>
        )}

        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={[styles.primary, saving && styles.primaryDisabled, { marginBottom: insets.bottom + 16 }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Зберегти</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  greeting: { color: theme.muted, fontSize: 13 },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink, marginTop: 2 },
  logout: { color: theme.muted, fontSize: 13, paddingVertical: 4, paddingHorizontal: 4 },
  segmented: { flexDirection: "row", backgroundColor: theme.oliveTint, borderRadius: 12, padding: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segmentActive: { backgroundColor: theme.surface },
  segmentText: { color: theme.muted, fontWeight: "500" },
  segmentTextActive: { color: theme.ink },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  amount: { flex: 1, fontSize: 38, fontWeight: "700", color: theme.ink, paddingVertical: 14 },
  currency: { fontSize: 24, color: theme.muted },
  section: { gap: 8 },
  label: { fontSize: 12, color: theme.muted, fontWeight: "500" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.surface,
  },
  chipText: { color: theme.inkSoft, fontSize: 13 },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: theme.ink,
    backgroundColor: theme.surface,
  },
  error: { backgroundColor: theme.negativeTint, color: theme.negative, borderRadius: 12, padding: 10, fontSize: 13 },
  success: { backgroundColor: theme.oliveTint, color: theme.oliveDeep, borderRadius: 12, padding: 10, fontSize: 13 },
  primary: { backgroundColor: theme.olive, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
