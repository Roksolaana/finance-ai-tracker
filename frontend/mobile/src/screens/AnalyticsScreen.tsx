import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MONTH_NAMES_SHORT,
  filterByMonth,
  monthKey,
  shiftMonth,
  type MonthStats,
  type MonthlySummary,
  type TransactionCategory,
} from "@finance/shared";
import { statsApi, transactionsApi } from "@/api";
import { categoryColor, money, monthLabel, signedMoney } from "@/format";
import { useNav } from "@/navigation/context";
import { BlockTitle, Card, CategoryIcon, EmptyState, ScreenHeader, ui } from "@/ui";
import { theme } from "@/theme";

const CHART_MONTHS = 12;

export function AnalyticsScreen() {
  const { push, showToast, dataVersion } = useNav();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [history, setHistory] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    try {
      setStats(await statsApi.month(key));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити аналітику");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(month);
  }, [load, month, dataVersion]);

  // Стрічка за рік завжди закінчується поточним місяцем і не залежить від
  // вибраного — інакше вона зсувалася б під пальцем після натискання.
  const chartRef = useRef<ScrollView>(null);
  useEffect(() => {
    statsApi
      .monthly(monthKey(new Date()), CHART_MONTHS)
      .then((monthly) => setHistory(monthly.summaries))
      .catch(() => setHistory([]));
  }, [dataVersion]);

  const isCurrent = month === monthKey(new Date());

  // На телефоні файл CSV незручний: звіт іде текстом у будь-який месенджер.
  const share = async () => {
    if (!stats) return;
    try {
      const all = await transactionsApi.list();
      const items = filterByMonth(all, month);
      const lines = [
        `Крона · ${monthLabel(month)}`,
        `Доходи: ${money(stats.total_income)}`,
        `Витрати: ${money(stats.total_expenses)}`,
        `Баланс: ${signedMoney(stats.balance)}`,
        "",
        "Витрати за категоріями:",
        ...stats.category_breakdown.map((c) => `• ${c.category}: ${money(c.amount)} (${c.percent}%)`),
        "",
        `Операції (${items.length}):`,
        ...items.map((t) => {
          const day = new Date(t.spent_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
          return `${day}  ${signedMoney(t.amount)}  ${t.category}${t.note ? ` — ${t.note}` : ""}`;
        }),
      ];
      await Share.share({ title: `Звіт за ${monthLabel(month)}`, message: lines.join("\n") });
    } catch {
      showToast({ kind: "error", text: "Не вдалося підготувати звіт" });
    }
  };
  const hint = stats?.comparison_up_to_day
    ? `проти 1–${stats.comparison_up_to_day} числа минулого місяця`
    : "проти минулого місяця";
  const peak = Math.max(1, ...history.map((h) => Math.max(h.income, h.expense)));
  const topShare = stats?.category_breakdown[0]?.amount ?? 1;

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title="Аналітика"
        right={
          stats && stats.transaction_count > 0 ? (
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel="Поділитися звітом за місяць"
              hitSlop={8}
              style={styles.share}
            >
              <Ionicons name="share-outline" size={20} color={theme.olive} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={ui.content}
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
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => setMonth((key) => shiftMonth(key, -1))}
            accessibilityRole="button"
            accessibilityLabel="Попередній місяць"
            style={styles.monthButton}
          >
            <Ionicons name="chevron-back" size={20} color={theme.ink} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
          <Pressable
            onPress={() => setMonth((key) => shiftMonth(key, 1))}
            disabled={isCurrent}
            accessibilityRole="button"
            accessibilityLabel="Наступний місяць"
            style={[styles.monthButton, isCurrent && styles.disabled]}
          >
            <Ionicons name="chevron-forward" size={20} color={theme.ink} />
          </Pressable>
        </View>

        {error && <Text style={ui.error}>{error}</Text>}

        {loading && !stats ? (
          <ActivityIndicator color={theme.olive} style={styles.loader} />
        ) : stats ? (
          <>
            <View style={styles.kpis}>
              <Kpi label="Доходи" value={money(stats.total_income)} change={stats.comparison.income_change} hint={hint} />
              <Kpi
                label="Витрати"
                value={money(stats.total_expenses)}
                change={stats.comparison.expense_change}
                hint={hint}
                invert
              />
            </View>
            <Card style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Баланс місяця</Text>
              <Text style={[styles.balanceValue, stats.balance < 0 && styles.negative]}>
                {signedMoney(stats.balance)}
              </Text>
            </Card>

            <BlockTitle title="Куди пішли гроші" />
            <Card style={styles.categories}>
              {stats.category_breakdown.length === 0 ? (
                <EmptyState
                  icon="pie-chart-outline"
                  text="У цьому місяці витрат ще немає"
                  action="Додати витрату"
                  onAction={() => push({ name: "add", kind: "expense" })}
                />
              ) : (
                stats.category_breakdown.map((item) => (
                  <Pressable
                    key={item.category}
                    onPress={() =>
                      push({ name: "transactions", category: item.category as TransactionCategory })
                    }
                    accessibilityRole="button"
                    accessibilityHint="Показати операції цієї категорії"
                    style={({ pressed }) => [styles.category, pressed && styles.pressed]}
                  >
                    <CategoryIcon category={item.category} size={36} />
                    <View style={styles.categoryBody}>
                      <View style={styles.categoryHead}>
                        <Text style={styles.categoryName}>{item.category}</Text>
                        <Text style={styles.categoryAmount}>{money(item.amount)}</Text>
                      </View>
                      <View style={styles.barRow}>
                        <View style={styles.track}>
                          <View
                            style={[
                              styles.fill,
                              {
                                width: `${(item.amount / topShare) * 100}%`,
                                backgroundColor: categoryColor(item.category),
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.percent}>{item.percent}%</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                  </Pressable>
                ))
              )}
              {stats.transaction_count > 0 && (
                <Text style={styles.footnote}>
                  У середньому {money(stats.avg_daily_expense)} на день · {stats.transaction_count} операцій
                </Text>
              )}
            </Card>

            {history.length > 0 && (
              <>
                <BlockTitle title="Доходи й витрати за рік" />
                <Card style={styles.chartCard}>
                  <ScrollView
                    ref={chartRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chart}
                    onContentSizeChange={() => chartRef.current?.scrollToEnd({ animated: false })}
                  >
                    {history.map((h) => {
                      const [, m] = h.month.split("-").map(Number);
                      const selected = h.month === month;
                      return (
                        <Pressable
                          key={h.month}
                          onPress={() => setMonth(h.month)}
                          accessibilityRole="button"
                          accessibilityLabel={`${monthLabel(h.month)}: доходи ${money(h.income)}, витрати ${money(h.expense)}`}
                          style={[styles.column, selected && styles.columnActive]}
                        >
                          <View style={styles.bars}>
                            <View style={[styles.bar, styles.barIncome, { height: `${(h.income / peak) * 100}%` }]} />
                            <View style={[styles.bar, styles.barExpense, { height: `${(h.expense / peak) * 100}%` }]} />
                          </View>
                          <Text style={[styles.columnLabel, selected && styles.columnLabelActive]}>
                            {MONTH_NAMES_SHORT[m - 1]}
                          </Text>
                          {/* Рядок року є в кожному стовпчику, щоб висота стовпчиків не відрізнялась. */}
                          <Text style={styles.columnYear}>{m === 1 ? h.month.slice(0, 4) : " "}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.legend}>
                    <Legend color={theme.positive} label="Доходи" />
                    <Legend color={theme.negative} label="Витрати" />
                  </View>
                </Card>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
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
    <Card style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {change !== null && (
        <Text style={[styles.kpiChange, good ? styles.good : styles.negative]}>
          {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
        </Text>
      )}
      <Text style={styles.kpiHint}>{hint}</Text>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  share: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.oliveTint,
    alignItems: "center",
    justifyContent: "center",
  },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.3 },
  monthLabel: { fontSize: 18, fontWeight: "700", color: theme.ink },
  loader: { marginTop: 40 },
  kpis: { flexDirection: "row", gap: 12 },
  kpi: { flex: 1, padding: 14 },
  kpiLabel: { color: theme.inkSoft, fontSize: 13 },
  kpiValue: { color: theme.ink, fontSize: 20, fontWeight: "700", marginTop: 4 },
  kpiChange: { fontSize: 13, fontWeight: "600", marginTop: 6 },
  kpiHint: { color: theme.inkSoft, fontSize: 11, marginTop: 2 },
  good: { color: theme.positive },
  negative: { color: theme.negative },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { color: theme.inkSoft, fontSize: 14 },
  balanceValue: { color: theme.positive, fontSize: 18, fontWeight: "700" },
  categories: { gap: 4, paddingVertical: 8 },
  category: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  pressed: { opacity: 0.6 },
  categoryBody: { flex: 1, gap: 6 },
  categoryHead: { flexDirection: "row", justifyContent: "space-between" },
  categoryName: { color: theme.ink, fontSize: 14, textTransform: "capitalize" },
  categoryAmount: { color: theme.ink, fontSize: 14, fontWeight: "600" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.lineSoft, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  percent: { color: theme.inkSoft, fontSize: 12, width: 34, textAlign: "right" },
  footnote: { color: theme.inkSoft, fontSize: 12, marginTop: 8 },
  chartCard: { paddingHorizontal: 8 },
  chart: { height: 170, gap: 4, paddingHorizontal: 4 },
  column: { width: 44, alignItems: "center", gap: 6, paddingTop: 6, paddingBottom: 4, borderRadius: 10 },
  columnActive: { backgroundColor: theme.oliveTint },
  columnYear: { color: theme.inkSoft, fontSize: 11, marginTop: -4 },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  bar: { width: 10, borderRadius: 4, minHeight: 2 },
  barIncome: { backgroundColor: theme.positive },
  barExpense: { backgroundColor: theme.negative },
  columnLabel: { color: theme.inkSoft, fontSize: 12 },
  columnLabelActive: { color: theme.ink, fontWeight: "700" },
  legend: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: theme.inkSoft, fontSize: 12 },
});
