import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MONTH_NAMES,
  MONTH_NAMES_GENITIVE,
  MONTH_NAMES_SHORT,
  monthKey,
  type MonthStats,
  type MonthlySummary,
  type TransactionCategory,
} from "@finance/shared";
import { statsApi, transactionsApi } from "@/api";
import { categoryColor, money, monthLabel, signedMoney } from "@/format";
import { useNav, useReloadOnChange } from "@/navigation/context";
import { TreeRings } from "@/rings";
import { Card, EmptyState, ScreenHeader, ui } from "@/ui";
import { fonts, theme } from "@/theme";

const CHART_MONTHS = 12;
const RING_MONTHS = 6;
const RING_SIZE = 240;

export function AnalyticsScreen() {
  const { push, showToast } = useNav();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [history, setHistory] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При швидкому перемиканні місяців відповіді можуть прийти не по черзі;
  // показуємо лише відповідь на останній запит.
  const request = useRef(0);
  const load = useCallback(async (key: string) => {
    const id = ++request.current;
    try {
      const next = await statsApi.month(key);
      if (id !== request.current) return;
      setStats(next);
      setError(null);
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Не вдалося завантажити аналітику");
    } finally {
      if (id === request.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Інакше під назвою нового місяця, поки він вантажиться, стояли б цифри попереднього.
    setStats(null);
    setLoading(true);
    void load(month);
  }, [load, month]);

  // Стрічка за рік завжди закінчується поточним місяцем і не залежить від
  // вибраного — інакше вона зсувалася б під пальцем після натискання.
  const chartRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const loadHistory = useCallback(() => {
    statsApi
      .monthly(monthKey(new Date()), CHART_MONTHS)
      .then((monthly) => setHistory(monthly.summaries))
      .catch(() => setHistory([]));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  useReloadOnChange(
    useCallback(() => {
      void load(month);
      loadHistory();
    }, [load, loadHistory, month]),
  );

  // На телефоні файл CSV незручний: звіт іде текстом у будь-який месенджер.
  const share = async () => {
    if (!stats || stats.month !== month) return;
    try {
      const items = await transactionsApi.inMonth(month);
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
    ? `проти 1–${stats.comparison_up_to_day} числа мин. місяця`
    : "проти минулого місяця";
  const peak = Math.max(1, ...history.map((h) => Math.max(h.income, h.expense)));

  // Кільця — останні пів року; вибраний місяць підсвічено. Якщо в стрічці
  // за рік вибрали старіший місяць, кільця лишаються без підсвітки.
  const rings = history.slice(-RING_MONTHS);
  const ringIndex = rings.findIndex((h) => h.month === month);
  const halfYear = rings.reduce((sum, h) => sum + h.net, 0);
  const monthIndex = Number(month.slice(5)) - 1;

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title="Аналітика"
        subtitle={rings.length ? `Пів року заощаджень — ${signedMoney(halfYear).replace(/^\+/, "")}` : undefined}
        right={
          stats && stats.transaction_count > 0 ? (
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel="Поділитися звітом за місяць"
              hitSlop={8}
              style={styles.share}
            >
              <Ionicons name="share-outline" size={20} color={theme.inkSoft} />
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
              loadHistory();
            }}
            tintColor={theme.olive}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.ringsWrap}>
            <TreeRings nets={rings.map((h) => h.net)} size={RING_SIZE} highlight={ringIndex} />
          </View>
          <Text style={styles.heroLabel}>
            {MONTH_NAMES[monthIndex].toUpperCase()} · {stats && stats.balance < 0 ? "ПЕРЕВИТРАТА" : "ЗАОЩАДЖЕНО"}
          </Text>
          {loading && !stats ? (
            <ActivityIndicator color={theme.cream} style={styles.loader} />
          ) : (
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {stats ? signedMoney(stats.balance) : "—"}
            </Text>
          )}
          {rings.length > 0 && (
            <View style={styles.chips}>
              {rings.map((h) => {
                const selected = h.month === month;
                return (
                  <Pressable
                    key={h.month}
                    onPress={() => setMonth(h.month)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={monthLabel(h.month)}
                    style={({ pressed }) => [styles.chip, selected && styles.chipActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {MONTH_NAMES_SHORT[Number(h.month.slice(5)) - 1]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {error && <Text style={ui.error}>{error}</Text>}

        {stats && (
          <>
            <Card style={styles.spending}>
              <View style={styles.spendingHead}>
                <Text style={styles.spendingTitle}>Витрати {MONTH_NAMES_GENITIVE[monthIndex]}</Text>
                <Text style={styles.spendingTotal}>{money(stats.total_expenses)}</Text>
              </View>
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
                      push({ name: "transactions", category: item.category as TransactionCategory, month })
                    }
                    accessibilityRole="button"
                    accessibilityHint="Показати операції цієї категорії"
                    style={({ pressed }) => [styles.category, pressed && styles.pressed]}
                  >
                    <View style={styles.categoryHead}>
                      <Text style={styles.categoryName}>{item.category}</Text>
                      <Text style={styles.categoryAmount}>
                        {money(item.amount)} · {item.percent}%
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${item.percent}%`, backgroundColor: categoryColor(item.category) },
                        ]}
                      />
                    </View>
                  </Pressable>
                ))
              )}
              {stats.transaction_count > 0 && (
                <Text style={styles.footnote}>
                  у середньому {money(stats.avg_daily_expense)} на день · {stats.transaction_count} операцій
                </Text>
              )}
            </Card>

            <View style={styles.kpis}>
              <Kpi label="ДОХОДИ" value={money(stats.total_income)} change={stats.comparison.income_change} hint={hint} />
              <Kpi
                label="ВИТРАТИ"
                value={money(stats.total_expenses)}
                change={stats.comparison.expense_change}
                hint={hint}
                invert
              />
            </View>

            {history.length > 0 && (
              <Card style={styles.chartCard}>
                <Text style={styles.spendingTitle}>Доходи й витрати за рік</Text>
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
                  <Legend color={theme.oliveSoft} label="Доходи" />
                  <Legend color={theme.forest} label="Витрати" />
                </View>
              </Card>
            )}
          </>
        )}
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
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {change !== null && (
        <View style={[styles.kpiChange, good ? styles.goodBg : styles.badBg]}>
          <Text style={[styles.kpiChangeText, good ? styles.good : styles.negative]}>
            {change > 0 ? "+" : "−"}
            {Math.abs(change).toFixed(1).replace(".", ",")}%
          </Text>
        </View>
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
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.75 },
  hero: { backgroundColor: theme.forest, borderRadius: 30, padding: 18, paddingTop: 26, alignItems: "center" },
  ringsWrap: { marginBottom: 22 },
  heroLabel: { color: theme.oliveSoft, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1.8 },
  loader: { marginVertical: 18 },
  heroValue: { color: "#fff", fontSize: 38, fontFamily: fonts.display, letterSpacing: -1, marginTop: 8 },
  chips: { flexDirection: "row", gap: 6, marginTop: 18, alignSelf: "stretch" },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: theme.cream },
  chipText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: fonts.monoMedium },
  chipTextActive: { color: theme.forest },
  spending: { gap: 14, padding: 20 },
  spendingHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  spendingTitle: { color: theme.ink, fontSize: 17, fontFamily: fonts.display },
  spendingTotal: { color: theme.ink, fontSize: 14, fontFamily: fonts.monoMedium },
  category: { gap: 8 },
  categoryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  categoryName: { color: theme.ink, fontSize: 15, textTransform: "capitalize" },
  categoryAmount: { color: theme.inkSoft, fontSize: 12, fontFamily: fonts.mono },
  track: { height: 8, borderRadius: 4, backgroundColor: theme.lineSoft, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, minWidth: 4 },
  footnote: { color: theme.muted, fontSize: 12, fontFamily: fonts.mono },
  kpis: { flexDirection: "row", gap: 10 },
  kpi: { flex: 1, padding: 16, gap: 8 },
  kpiLabel: { color: theme.muted, fontSize: 10, fontFamily: fonts.mono, letterSpacing: 1.4 },
  kpiValue: { color: theme.ink, fontSize: 20, fontFamily: fonts.display },
  kpiChange: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  kpiChangeText: { fontSize: 12, fontFamily: fonts.monoMedium },
  goodBg: { backgroundColor: "#E4EFE0" },
  badBg: { backgroundColor: theme.negativeTint },
  kpiHint: { color: theme.muted, fontSize: 11 },
  good: { color: theme.positive },
  negative: { color: theme.negative },
  chartCard: { gap: 12, padding: 18 },
  chart: { height: 170, gap: 4 },
  column: { width: 44, alignItems: "center", gap: 6, paddingTop: 6, paddingBottom: 4, borderRadius: 12 },
  columnActive: { backgroundColor: theme.oliveTint },
  columnYear: { color: theme.muted, fontSize: 10, fontFamily: fonts.mono, marginTop: -4 },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  bar: { width: 10, borderRadius: 4, minHeight: 2 },
  barIncome: { backgroundColor: theme.oliveSoft },
  barExpense: { backgroundColor: theme.forest },
  columnLabel: { color: theme.muted, fontSize: 12, fontFamily: fonts.mono },
  columnLabelActive: { color: theme.ink },
  legend: { flexDirection: "row", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: theme.inkSoft, fontSize: 12 },
});
