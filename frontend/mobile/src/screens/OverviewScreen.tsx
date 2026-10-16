import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CATEGORY_COLORS,
  MONTH_NAMES,
  monthKey,
  shiftMonth,
  type MonthStats,
  type TransactionCategory,
} from "@finance/shared";
import { statsApi } from "@/api";
import { useAuth } from "@/AuthContext";
import { theme } from "@/theme";

function money(value: number): string {
  const abs = Math.abs(value);
  const digits = Number.isInteger(abs) ? 0 : 2;
  return `${abs.toLocaleString("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₴`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function OverviewScreen({ dataVersion }: { dataVersion: number }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    try {
      setStats(await statsApi.month(key));
      setError(null);
    } catch (err) {
      setStats(null);
      setError(err instanceof Error ? err.message : "Не вдалося завантажити статистику");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Скидаємо, щоб під новим заголовком не висіли цифри попереднього місяця.
    setStats(null);
    setLoading(true);
    void load(month);
  }, [load, month, dataVersion]);

  const isCurrentMonth = month === monthKey(new Date());
  const comparisonHint = stats?.comparison_up_to_day
    ? `проти 1–${stats.comparison_up_to_day} числа мин. місяця`
    : "від попереднього місяця";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 24 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(month);
          }}
          tintColor={theme.olive}
        />
      }
    >
      <Text style={styles.greeting}>Вітаю, {user?.display_name?.split(" ")[0]}</Text>

      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setMonth((key) => shiftMonth(key, -1))}
          accessibilityRole="button"
          accessibilityLabel="Попередній місяць"
          style={styles.monthButton}
        >
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => setMonth((key) => shiftMonth(key, 1))}
          disabled={isCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Наступний місяць"
          style={[styles.monthButton, isCurrentMonth && styles.monthButtonDisabled]}
        >
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.olive} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load(month)} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Спробувати знову</Text>
          </Pressable>
        </View>
      )}

      {!loading && stats && (
        <>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Загальний баланс</Text>
            <Text style={styles.balanceValue}>{money(stats.total_balance)}</Text>
            <View style={styles.chips}>
              <Text style={styles.chip}>
                {stats.balance >= 0 ? "Заощаджено" : "Перевитрата"} {money(stats.balance)}
              </Text>
              {stats.savings_rate > 0 && (
                <Text style={styles.chip}>{Math.round(stats.savings_rate * 100)}% доходу збережено</Text>
              )}
            </View>
          </View>

          <View style={styles.kpiRow}>
            <Kpi
              label="Доходи"
              value={money(stats.total_income)}
              change={stats.comparison.income_change}
              hint={comparisonHint}
            />
            <Kpi
              label="Витрати"
              value={money(stats.total_expenses)}
              change={stats.comparison.expense_change}
              hint={comparisonHint}
              invert
            />
          </View>

          {stats.transaction_count === 0 ? (
            <Text style={styles.empty}>У цьому місяці ще немає записів.</Text>
          ) : (
            <>
              <Section title="Структура витрат">
                {stats.category_breakdown.slice(0, 6).map((item) => (
                  <View key={item.category} style={styles.catRow}>
                    <View
                      style={[
                        styles.catDot,
                        { backgroundColor: CATEGORY_COLORS[item.category as TransactionCategory] ?? theme.muted },
                      ]}
                    />
                    <Text style={styles.catName}>{item.category}</Text>
                    <Text style={styles.catPercent}>{item.percent}%</Text>
                    <Text style={styles.catAmount}>{money(item.amount)}</Text>
                  </View>
                ))}
                <Text style={styles.footnote}>
                  Середні витрати: {money(stats.avg_daily_expense)} на день · {stats.transaction_count} записів
                </Text>
              </Section>

              {stats.budgets.length > 0 && (
                <Section title="Ліміти бюджету">
                  {stats.budgets.map((budget) => {
                    const share = budget.limit > 0 ? Math.min(budget.spent / budget.limit, 1) : 0;
                    const over = budget.spent > budget.limit;
                    return (
                      <View key={budget.category} style={styles.budget}>
                        <View style={styles.budgetHead}>
                          <Text style={styles.catName}>{budget.category}</Text>
                          <Text style={[styles.budgetNums, over && styles.budgetOver]}>
                            {money(budget.spent)} / {money(budget.limit)}
                          </Text>
                        </View>
                        <View style={styles.track}>
                          <View
                            style={[
                              styles.fill,
                              { width: `${share * 100}%`, backgroundColor: over ? theme.negative : theme.olive },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </Section>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Kpi({
  label,
  value,
  change,
  hint,
  invert = false,
}: {
  label: string;
  value: string;
  change: number | null;
  hint: string;
  invert?: boolean;
}) {
  // Для витрат зростання — погано, тому колір міняємо місцями.
  const good = change === null ? null : invert ? change < 0 : change > 0;
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {change !== null && (
        <Text style={[styles.kpiChange, good ? styles.kpiGood : styles.kpiBad]}>
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}%
        </Text>
      )}
      <Text style={styles.kpiHint}>{hint}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, gap: 14 },
  greeting: { color: theme.muted, fontSize: 13 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonDisabled: { opacity: 0.35 },
  monthArrow: { fontSize: 20, color: theme.ink, lineHeight: 24 },
  monthLabel: { fontSize: 18, fontWeight: "700", color: theme.ink },
  center: { paddingVertical: 40, alignItems: "center", gap: 12 },
  error: { color: theme.negative, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.oliveTint },
  retryText: { color: theme.oliveDeep, fontWeight: "600" },
  balanceCard: { backgroundColor: theme.oliveDeep, borderRadius: 20, padding: 18 },
  balanceLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  balanceValue: { color: "#fff", fontSize: 30, fontWeight: "700", marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    color: "#fff",
    fontSize: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  kpiRow: { flexDirection: "row", gap: 12 },
  kpi: { flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 14 },
  kpiLabel: { color: theme.muted, fontSize: 12 },
  kpiValue: { color: theme.ink, fontSize: 19, fontWeight: "700", marginTop: 4 },
  kpiChange: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  kpiGood: { color: theme.positive },
  kpiBad: { color: theme.negative },
  kpiHint: { color: theme.muted, fontSize: 10, marginTop: 2 },
  section: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: theme.ink },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  catName: { color: theme.inkSoft, fontSize: 13, flex: 1, textTransform: "capitalize" },
  catPercent: { color: theme.muted, fontSize: 12, width: 38, textAlign: "right" },
  catAmount: { color: theme.ink, fontSize: 13, fontWeight: "600", width: 86, textAlign: "right" },
  footnote: { color: theme.muted, fontSize: 11, marginTop: 4 },
  budget: { gap: 6 },
  budgetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  budgetNums: { color: theme.muted, fontSize: 12 },
  budgetOver: { color: theme.negative, fontWeight: "600" },
  track: { height: 7, borderRadius: 4, backgroundColor: theme.lineSoft, overflow: "hidden" },
  fill: { height: 7, borderRadius: 4 },
  empty: { color: theme.muted, textAlign: "center", paddingVertical: 24 },
});
