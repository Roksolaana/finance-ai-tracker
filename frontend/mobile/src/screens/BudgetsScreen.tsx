import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EXPENSE_CATEGORIES, monthKey, type BudgetLimits, type TransactionCategory } from "@finance/shared";
import { budgetsApi, statsApi } from "@/api";
import { money } from "@/format";
import { useNav, useScreen } from "@/navigation/context";
import { Card, CategoryIcon, EmptyState, PrimaryButton, ScreenHeader, ui } from "@/ui";
import { theme } from "@/theme";

export function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const { close, showToast, refresh } = useNav();
  const screen = useScreen();
  const [drafts, setDrafts] = useState<Partial<Record<TransactionCategory, string>>>({});
  const [spent, setSpent] = useState<Partial<Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  // Без успішного завантаження зберігати не можна: порожня форма пішла б на
  // сервер як «без лімітів» і стерла б усі наявні.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [limits, stats] = await Promise.all([budgetsApi.get(), statsApi.month(monthKey(new Date()))]);
      const next: Partial<Record<TransactionCategory, string>> = {};
      for (const [category, limit] of Object.entries(limits)) {
        if (limit) next[category as TransactionCategory] = String(limit);
      }
      setDrafts(next);
      setSpent(Object.fromEntries(stats.category_breakdown.map((c) => [c.category, c.amount])));
      setError(null);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити ліміти");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!loaded) return;
    const limits: BudgetLimits = {};
    for (const [category, raw] of Object.entries(drafts)) {
      const value = Number((raw ?? "").replace(",", "."));
      if (raw && (Number.isNaN(value) || value < 0)) {
        setError(`Перевірте ліміт для «${category}»`);
        return;
      }
      if (value > 0) limits[category as TransactionCategory] = value;
    }
    setSaving(true);
    setError(null);
    try {
      await budgetsApi.replace(limits);
      refresh();
      close(screen.id);
      showToast({ kind: "success", text: "Ліміти збережено" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти ліміти");
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding">
      <ScreenHeader title="Ліміти бюджету" subtitle="Діють щомісяця, поки не зміните" />
      {loading ? (
        <ActivityIndicator color={theme.olive} style={styles.loader} />
      ) : !loaded ? (
        <EmptyState
          icon="cloud-offline-outline"
          text={error ?? "Не вдалося завантажити ліміти"}
          action="Спробувати знову"
          onAction={() => void load()}
        />
      ) : (
        <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Вкажіть, скільки готові витрачати на місяць. Порожнє поле — без ліміту.
          </Text>
          <Card style={styles.list}>
            {EXPENSE_CATEGORIES.map((category, index) => {
              const raw = drafts[category] ?? "";
              const limit = Number(raw.replace(",", ".")) || 0;
              const used = spent[category] ?? 0;
              const share = limit > 0 ? Math.min(used / limit, 1) : 0;
              const over = limit > 0 && used > limit;
              return (
                <View
                  key={category}
                  style={[styles.row, index < EXPENSE_CATEGORIES.length - 1 && styles.rowLine]}
                >
                  <CategoryIcon category={category} size={36} />
                  <View style={styles.rowBody}>
                    <Text style={styles.name}>{category}</Text>
                    <Text style={[styles.spent, over && styles.over]}>
                      {limit > 0
                        ? `${money(used)} з ${money(limit)}${over ? " — перевищено" : ""}`
                        : `Цього місяця ${money(used)}`}
                    </Text>
                    {limit > 0 && (
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.fill,
                            { width: `${share * 100}%`, backgroundColor: over ? theme.negative : theme.olive },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={raw}
                      onChangeText={(text) =>
                        setDrafts((prev) => ({ ...prev, [category]: text.replace(/[^\d.,]/g, "") }))
                      }
                      placeholder="—"
                      placeholderTextColor={theme.muted}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      accessibilityLabel={`Ліміт для ${category}`}
                    />
                    <Text style={styles.currency}>₴</Text>
                  </View>
                </View>
              );
            })}
          </Card>
          {error && <Text style={ui.error}>{error}</Text>}
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <PrimaryButton label={saving ? "Зберігаю…" : "Зберегти ліміти"} onPress={save} disabled={saving || loading || !loaded} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 40, flex: 1 },
  intro: { color: theme.inkSoft, fontSize: 14, lineHeight: 20 },
  list: { paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: theme.lineSoft },
  rowBody: { flex: 1, gap: 3 },
  name: { color: theme.ink, fontSize: 15, textTransform: "capitalize" },
  spent: { color: theme.inkSoft, fontSize: 12 },
  over: { color: theme.negative, fontWeight: "600" },
  track: { height: 5, borderRadius: 3, backgroundColor: theme.lineSoft, overflow: "hidden", marginTop: 3 },
  fill: { height: 5, borderRadius: 3 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    width: 104,
  },
  input: { flex: 1, paddingVertical: 9, fontSize: 15, color: theme.ink, textAlign: "right" },
  currency: { color: theme.inkSoft, marginLeft: 4 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.lineSoft,
  },
});
