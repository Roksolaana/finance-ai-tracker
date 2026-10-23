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
import Ionicons from "@expo/vector-icons/Ionicons";
import { EXPENSE_CATEGORIES, dayKey, type Transaction, type TransactionCategory } from "@finance/shared";
import { transactionsApi } from "@/api";
import { categoryColor, categoryIcon, dayTitle } from "@/format";
import { useNav } from "@/navigation/context";
import { ScreenHeader, ui } from "@/ui";
import { theme } from "@/theme";

type Kind = "expense" | "income";

const DAY = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function AddScreen({
  kind: initialKind,
  edit,
  onSaved,
}: {
  kind?: Kind;
  edit?: Transaction;
  onSaved?: (saved: Transaction) => void;
}) {
  const insets = useSafeAreaInsets();
  const { pop, showToast, refresh } = useNav();
  const [kind, setKind] = useState<Kind>(edit ? (edit.amount > 0 ? "income" : "expense") : (initialKind ?? "expense"));
  const [amount, setAmount] = useState(edit ? String(Math.abs(edit.amount)) : "");
  const [category, setCategory] = useState<TransactionCategory>(
    edit && edit.category !== "дохід" ? edit.category : "їжа",
  );
  const [note, setNote] = useState(edit?.note ?? "");
  // Зберігаємо саму дату й окремо час: при зміні дня час лишається тим самим.
  const [when, setWhen] = useState(() => (edit ? new Date(edit.spent_at) : new Date()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = startOfDay(new Date());
  const isToday = startOfDay(when) === today;
  const isYesterday = startOfDay(when) === today - DAY;

  const shiftDay = (delta: number) => {
    const next = new Date(when.getTime() + delta * DAY);
    if (startOfDay(next) > today) return;
    // Для сьогоднішнього дня не можна залишити час у майбутньому.
    setWhen(next.getTime() > Date.now() ? new Date() : next);
  };

  const setDay = (offset: number) => {
    const base = new Date();
    if (offset === 0) {
      setWhen(base);
      return;
    }
    const target = new Date(today - offset * DAY);
    target.setHours(when.getHours(), when.getMinutes());
    setWhen(target);
  };

  const save = async () => {
    if (saving) return;
    setError(null);
    const parsed = Number(amount.replace(",", "."));
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError("Вкажіть суму більшу за нуль");
      return;
    }

    setSaving(true);
    const input = {
      amount: kind === "income" ? parsed : -parsed,
      category: kind === "income" ? ("дохід" as const) : category,
      note: note.trim() || null,
      spent_at: when.toISOString(),
    };
    try {
      const saved = edit ? await transactionsApi.update(edit.id, input) : await transactionsApi.create(input);
      refresh();
      onSaved?.(saved);
      pop();
      showToast({
        kind: "success",
        text: edit ? "Зміни збережено" : kind === "income" ? "Дохід додано" : "Витрату додано",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти. Перевірте зʼєднання");
      setSaving(false);
    }
  };

  const title = edit ? "Редагування" : kind === "income" ? "Новий дохід" : "Нова витрата";

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title={title} />
      <ScrollView contentContainerStyle={[ui.content, styles.content]} keyboardShouldPersistTaps="handled">
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

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Сума</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.sign, kind === "income" && styles.signIncome]}>{kind === "income" ? "+" : "−"}</Text>
            <TextInput
              value={amount}
              onChangeText={(text) => {
                setAmount(text.replace(/[^\d.,]/g, ""));
                setError(null);
              }}
              placeholder="0"
              placeholderTextColor={theme.line}
              keyboardType="decimal-pad"
              style={styles.amount}
              accessibilityLabel="Сума"
              autoFocus={!edit}
            />
            <Text style={styles.currency}>₴</Text>
          </View>
        </View>

        {kind === "expense" && (
          <View style={styles.section}>
            <Text style={styles.label}>Категорія</Text>
            <View style={styles.grid}>
              {EXPENSE_CATEGORIES.map((item) => {
                const selected = item === category;
                const color = categoryColor(item);
                return (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={item}
                    style={[styles.tile, selected && { borderColor: color, backgroundColor: `${color}14` }]}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: selected ? color : `${color}1F` }]}>
                      <Ionicons name={categoryIcon(item)} size={20} color={selected ? "#fff" : color} />
                    </View>
                    <Text style={[styles.tileText, selected && styles.tileTextActive]} numberOfLines={1}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Дата</Text>
          <View style={styles.dateRow}>
            <DayChip label="Сьогодні" selected={isToday} onPress={() => setDay(0)} />
            <DayChip label="Вчора" selected={isYesterday} onPress={() => setDay(1)} />
            <View style={styles.stepper}>
              <Pressable onPress={() => shiftDay(-1)} hitSlop={6} accessibilityLabel="Попередній день" style={styles.step}>
                <Ionicons name="chevron-back" size={18} color={theme.ink} />
              </Pressable>
              <Text style={styles.stepText} numberOfLines={1}>
                {isToday || isYesterday
                  ? when.toLocaleDateString("uk-UA", { day: "numeric", month: "short" })
                  : dayTitle(dayKey(when))}
              </Text>
              <Pressable
                onPress={() => shiftDay(1)}
                disabled={isToday}
                hitSlop={6}
                accessibilityLabel="Наступний день"
                style={[styles.step, isToday && styles.stepDisabled]}
              >
                <Ionicons name="chevron-forward" size={18} color={theme.ink} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Нотатка</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={kind === "income" ? "Стипендія, фріланс…" : "Кава з собою перед парою"}
            placeholderTextColor={theme.muted}
            style={styles.input}
            maxLength={1000}
            multiline
          />
          <Text style={styles.hint}>Асистент шукає й за змістом нотаток — пишіть своїми словами</Text>
        </View>

        {error && (
          <Text style={ui.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, (saving || pressed) && styles.primaryDim]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Зберегти</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function DayChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.dayChip, selected && styles.dayChipActive]}
    >
      <Text style={[styles.dayChipText, selected && styles.dayChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 16 },
  segmented: { flexDirection: "row", backgroundColor: theme.oliveTint, borderRadius: 14, padding: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: "center" },
  segmentActive: { backgroundColor: theme.surface },
  segmentText: { color: theme.inkSoft, fontWeight: "500", fontSize: 15 },
  segmentTextActive: { color: theme.ink, fontWeight: "600" },
  amountCard: { backgroundColor: theme.surface, borderRadius: 18, paddingHorizontal: 18, paddingTop: 12 },
  amountLabel: { color: theme.inkSoft, fontSize: 13 },
  amountRow: { flexDirection: "row", alignItems: "center" },
  sign: { fontSize: 36, fontWeight: "700", color: theme.negative, marginRight: 4 },
  signIncome: { color: theme.positive },
  amount: { flex: 1, fontSize: 40, fontWeight: "700", color: theme.ink, paddingVertical: 8 },
  currency: { fontSize: 26, color: theme.inkSoft },
  section: { gap: 8 },
  label: { fontSize: 14, color: theme.ink, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    width: "23%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  tileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tileText: { color: theme.inkSoft, fontSize: 12 },
  tileTextActive: { color: theme.ink, fontWeight: "600" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
  },
  dayChipActive: { backgroundColor: theme.olive, borderColor: theme.olive },
  dayChipText: { color: theme.inkSoft, fontSize: 14 },
  dayChipTextActive: { color: "#fff", fontWeight: "600" },
  stepper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.line,
  },
  step: { paddingHorizontal: 8, paddingVertical: 9 },
  stepDisabled: { opacity: 0.3 },
  stepText: { color: theme.ink, fontSize: 14, fontWeight: "500", flexShrink: 1 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.ink,
    backgroundColor: theme.surface,
    minHeight: 48,
  },
  hint: { color: theme.inkSoft, fontSize: 12 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.lineSoft,
  },
  primary: { backgroundColor: theme.olive, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryDim: { opacity: 0.8 },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
