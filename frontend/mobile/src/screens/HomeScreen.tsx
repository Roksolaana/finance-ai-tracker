import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MONTH_NAMES, monthKey, quickPrompts, type MonthStats, type Transaction } from "@finance/shared";
import { statsApi, transactionsApi } from "@/api";
import { useAuth } from "@/AuthContext";
import { categoryColor, money, signedMoney } from "@/format";
import { useNav, useReloadOnChange } from "@/navigation/context";
import { TreeRings } from "@/rings";
import { BlockTitle, Card, EmptyState, TransactionRow, ui } from "@/ui";
import { fonts, theme } from "@/theme";

const RING_MONTHS = 6;

function greeting(hour: number): string {
  if (hour < 5) return "Доброї ночі";
  if (hour < 12) return "Доброго ранку";
  if (hour < 18) return "Добрий день";
  return "Добрий вечір";
}

function daysWord(n: number): string {
  const tens = n % 100;
  const last = n % 10;
  if (tens >= 11 && tens <= 14) return "днів";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дні";
  return "днів";
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { push, switchTab, ask } = useNav();
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [nets, setNets] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const month = monthKey(now);

  // Відповідь на застарілий запит (збереження, а одразу «Повернути») не
  // має перезаписати свіжішу.
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    // Кільця — прикраса: якщо підсумки за пів року не прийшли, малюємо рівні,
    // а решта головної працює як завжди.
    statsApi
      .monthly(month, RING_MONTHS)
      .then((data) => id === request.current && setNets(data.summaries.map((s) => s.net)))
      .catch(() => id === request.current && setNets([]));
    try {
      const [monthStats, list] = await Promise.all([statsApi.month(month), transactionsApi.recent(4)]);
      if (id !== request.current) return;
      setStats(monthStats);
      setRecent(list);
      setError(null);
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Не вдалося завантажити дані");
    } finally {
      if (id === request.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);
  useReloadOnChange(load);

  const firstName = user?.display_name?.split(" ")[0] ?? "";
  const today = now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();

  // Яку частку доходу вже витрачено — головне, що хочеться знати посеред місяця.
  const spentShare = stats && stats.total_income > 0 ? stats.total_expenses / stats.total_income : null;
  const overspent = spentShare !== null && spentShare > 1;

  const categories = stats?.category_breakdown ?? [];
  const totalExpenses = stats?.total_expenses ?? 0;
  const balance = stats ? signedMoney(stats.balance).replace(/ ₴$/, "") : "—";

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, { paddingTop: insets.top + 16 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={theme.olive}
        />
      }
    >
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text style={styles.date}>{today}</Text>
          <Text style={styles.hello} numberOfLines={2}>
            {greeting(now.getHours())}, {firstName}
          </Text>
        </View>
        <Pressable
          onPress={() => push({ name: "profile" })}
          accessibilityRole="button"
          accessibilityLabel="Профіль"
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase() || "К"}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => switchTab("analytics")}
        accessibilityRole="button"
        accessibilityLabel="Підсумок місяця, відкрити аналітику"
        style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
      >
        <TreeRings nets={nets} size={230} style={styles.heroRings} />

        <View style={styles.heroHead}>
          <Text style={styles.heroLabel}>ЗАЛИШОК · {MONTH_NAMES[now.getMonth()].toUpperCase()}</Text>
          <View style={styles.daysPill}>
            <Text style={styles.daysText}>{daysLeft === 0 ? "останній день" : `ще ${daysLeft} ${daysWord(daysLeft)}`}</Text>
          </View>
        </View>

        {loading && !stats ? (
          <ActivityIndicator color={theme.cream} style={styles.loader} />
        ) : (
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {balance}
            <Text style={styles.heroCurrency}> ₴</Text>
          </Text>
        )}

        {spentShare !== null && (
          <View style={styles.meter}>
            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  { width: `${Math.min(spentShare, 1) * 100}%`, backgroundColor: overspent ? "#E08A73" : theme.oliveSoft },
                ]}
              />
            </View>
            <Text style={styles.meterText}>
              {overspent
                ? `витрати більші за дохід на ${money(stats!.total_expenses - stats!.total_income)}`
                : `витрачено ${Math.round(spentShare * 100)}% доходу`}
            </Text>
          </View>
        )}

        <View style={styles.flows}>
          <View style={styles.flow}>
            <Text style={styles.flowLabel}>Надійшло</Text>
            <Text style={styles.flowValue}>{stats ? money(stats.total_income) : "—"}</Text>
          </View>
          <View style={styles.flow}>
            <Text style={styles.flowLabel}>Витрачено</Text>
            <Text style={styles.flowValue}>{stats ? money(stats.total_expenses) : "—"}</Text>
          </View>
          <View style={styles.flow}>
            <Text style={styles.flowLabel}>У середньому</Text>
            <Text style={styles.flowValue}>{stats ? `${money(stats.avg_daily_expense)}/д` : "—"}</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.buttons}>
        <Pressable
          onPress={() => push({ name: "add", kind: "expense" })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bigButton, styles.expenseButton, pressed && styles.pressed]}
        >
          <Ionicons name="remove" size={22} color="#fff" />
          <Text style={styles.bigButtonText}>Витрата</Text>
        </Pressable>
        <Pressable
          onPress={() => push({ name: "add", kind: "income" })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bigButton, styles.incomeButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={22} color={theme.positive} />
          <Text style={[styles.bigButtonText, styles.incomeButtonText]}>Дохід</Text>
        </Pressable>
      </View>

      {error && <Text style={ui.error}>{error}</Text>}

      {categories.length > 0 && (
        <Card onPress={() => switchTab("analytics")} label="Куди пішли гроші, відкрити аналітику" style={styles.where}>
          <View style={styles.whereHead}>
            <Text style={styles.whereTitle}>Куди пішли гроші</Text>
            <Text style={styles.whereLink}>Аналітика</Text>
          </View>
          <View style={styles.stack}>
            {categories.map((c) => (
              <View
                key={c.category}
                style={[
                  styles.block,
                  { flex: c.amount / Math.max(totalExpenses, 1), backgroundColor: categoryColor(c.category) },
                ]}
              />
            ))}
          </View>
          <View style={styles.legend}>
            {categories.slice(0, 4).map((c) => (
              <View key={c.category} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: categoryColor(c.category) }]} />
                <Text style={styles.legendName}>{c.category}</Text>
                <Text style={styles.legendValue}>{c.percent}%</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <View style={styles.assistant}>
        <View style={styles.assistantRings} pointerEvents="none">
          {[150, 110, 70, 34].map((d) => (
            <View
              key={d}
              style={[styles.assistantRing, { width: d, height: d, borderRadius: d / 2, marginLeft: -d / 2, marginTop: -d / 2 }]}
            />
          ))}
        </View>
        <Text style={styles.assistantTitle}>Запитайте Крону</Text>
        <Text style={styles.assistantSub}>Про суми, звички й навіть настрій покупок</Text>
        {quickPrompts.map((q) => (
          <Pressable
            key={q}
            onPress={() => ask(q)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.question, pressed && styles.pressed]}
          >
            <Text style={styles.questionText}>{q}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.oliveSoft} />
          </Pressable>
        ))}
      </View>

      {stats && stats.budgets.length > 0 ? (
        <>
          <BlockTitle title="Ліміти" action="Змінити" onAction={() => push({ name: "budgets" })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.limits}>
            {[...stats.budgets]
              .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
              .map((budget) => {
                const share = budget.limit > 0 ? Math.min(budget.spent / budget.limit, 1) : 0;
                const over = budget.spent > budget.limit;
                return (
                  <Pressable
                    key={budget.category}
                    onPress={() => push({ name: "budgets" })}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.limit, pressed && styles.pressed]}
                  >
                    <View style={styles.limitHead}>
                      <View style={[styles.legendDot, { backgroundColor: categoryColor(budget.category) }]} />
                      <Text style={styles.limitName}>{budget.category}</Text>
                    </View>
                    <Text style={[styles.limitLeft, over && styles.negative]}>
                      {over ? `+${money(budget.spent - budget.limit)}` : money(budget.limit - budget.spent)}
                    </Text>
                    <Text style={[styles.limitHint, over && styles.negative]}>{over ? "понад ліміт" : "ще можна"}</Text>
                    <View style={styles.limitTrack}>
                      <View
                        style={[
                          styles.limitFill,
                          {
                            width: `${share * 100}%`,
                            backgroundColor: over ? theme.negative : share > 0.8 ? theme.gold : theme.olive,
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
          </ScrollView>
        </>
      ) : stats ? (
        <Pressable onPress={() => push({ name: "budgets" })} accessibilityRole="button" style={styles.setLimits}>
          <Ionicons name="flag-outline" size={18} color={theme.olive} />
          <Text style={styles.setLimitsText}>Задати ліміти на категорії</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.olive} />
        </Pressable>
      ) : null}

      <BlockTitle title="Нещодавно" action="Усі операції" onAction={() => switchTab("transactions")} />
      <Card style={styles.recent}>
        {!loading && recent.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            text="Тут зʼявляться ваші витрати й доходи"
            action="Додати першу"
            onAction={() => push({ name: "add" })}
          />
        ) : (
          recent.map((t) => (
            <TransactionRow key={t.id} transaction={t} onPress={() => push({ name: "transaction", transaction: t })} />
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  topText: { flex: 1 },
  date: { color: theme.muted, fontSize: 12, fontFamily: fonts.mono, letterSpacing: 1.6, textTransform: "uppercase" },
  hello: { color: theme.ink, fontSize: 27, fontFamily: fonts.display, letterSpacing: -0.6, marginTop: 6 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: theme.oliveTint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontFamily: fonts.display, color: theme.oliveDeep },
  pressed: { opacity: 0.85 },
  hero: { backgroundColor: theme.forest, borderRadius: 28, padding: 22, overflow: "hidden" },
  heroRings: { position: "absolute", right: -70, top: -80 },
  heroHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  heroLabel: { color: theme.oliveSoft, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1.8 },
  daysPill: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  daysText: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: fonts.mono },
  loader: { alignSelf: "flex-start", marginVertical: 22 },
  heroValue: { color: "#fff", fontSize: 50, fontFamily: fonts.display, letterSpacing: -1.5, marginTop: 14 },
  heroCurrency: { color: theme.oliveSoft, fontSize: 26 },
  negative: { color: theme.negative },
  meter: { gap: 8, marginTop: 16 },
  meterTrack: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  meterFill: { height: 7, borderRadius: 4 },
  meterText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: fonts.mono },
  flows: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  flow: { flex: 1, gap: 4 },
  flowLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  flowValue: { color: "#fff", fontSize: 14, fontFamily: fonts.monoMedium },
  buttons: { flexDirection: "row", gap: 10 },
  bigButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 22,
  },
  expenseButton: { backgroundColor: theme.night },
  incomeButton: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line },
  bigButtonText: { color: "#fff", fontSize: 16, fontFamily: fonts.display },
  incomeButtonText: { color: theme.positive },
  where: { gap: 16, padding: 20 },
  whereHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  whereTitle: { fontSize: 17, fontFamily: fonts.display, color: theme.ink },
  whereLink: { color: theme.oliveDeep, fontSize: 13, fontWeight: "600" },
  stack: { flexDirection: "row", height: 46, gap: 4 },
  block: { borderRadius: 10, minWidth: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  legendItem: { width: "50%", flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 12 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendName: { flex: 1, color: theme.ink, fontSize: 14, textTransform: "capitalize" },
  legendValue: { color: theme.muted, fontSize: 13, fontFamily: fonts.mono },
  assistant: { backgroundColor: theme.night, borderRadius: 28, padding: 20, gap: 10, overflow: "hidden" },
  assistantRings: { position: "absolute", right: 30, top: 30 },
  assistantRing: { position: "absolute", borderWidth: 1, borderColor: "rgba(169,185,138,0.22)" },
  assistantTitle: { color: "#fff", fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.4 },
  assistantSub: { color: "rgba(255,255,255,0.72)", fontSize: 14, marginBottom: 4 },
  question: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  questionText: { flex: 1, color: "rgba(255,255,255,0.9)", fontSize: 14 },
  limits: { gap: 10, paddingRight: 4 },
  limit: {
    width: 150,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 14,
    gap: 2,
    borderWidth: 1,
    borderColor: theme.lineSoft,
  },
  limitHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  limitName: { color: theme.inkSoft, fontSize: 13, textTransform: "capitalize" },
  limitLeft: { color: theme.ink, fontSize: 17, fontFamily: fonts.display, marginTop: 8 },
  limitHint: { color: theme.muted, fontSize: 11, fontFamily: fonts.mono },
  limitTrack: { height: 6, borderRadius: 3, backgroundColor: theme.lineSoft, overflow: "hidden", marginTop: 10 },
  limitFill: { height: 6, borderRadius: 3 },
  setLimits: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.line,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  setLimitsText: { flex: 1, color: theme.oliveDeep, fontSize: 14, fontWeight: "500" },
  recent: { paddingVertical: 6, paddingHorizontal: 10 },
});
