import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MONTH_NAMES, monthKey, type MonthStats, type Transaction } from "@finance/shared";
import { statsApi, transactionsApi } from "@/api";
import { useAuth } from "@/AuthContext";
import { categoryColor, money, signedMoney } from "@/format";
import { useNav, useReloadOnChange } from "@/navigation/context";
import { BlockTitle, Card, EmptyState, TransactionRow, ui } from "@/ui";
import { theme } from "@/theme";

// Підказки для асистента — показують, що його можна питати і про числа, і про зміст.
const QUESTIONS = ["На що я витратила найбільше цього місяця?", "Скільки пішло на каву за місяць?"];

function greeting(hour: number): string {
  if (hour < 5) return "Доброї ночі";
  if (hour < 12) return "Доброго ранку";
  if (hour < 18) return "Добрий день";
  return "Добрий вечір";
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { push, switchTab, ask } = useNav();
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
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

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, { paddingTop: insets.top + 12 }]}
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
          <Text style={styles.hello}>
            {greeting(now.getHours())}, {firstName}
          </Text>
        </View>
        <Pressable
          onPress={() => push({ name: "profile" })}
          accessibilityRole="button"
          accessibilityLabel="Профіль"
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase() || "К"}</Text>
        </Pressable>
      </View>

      <Card onPress={() => switchTab("analytics")} label="Підсумок місяця, відкрити аналітику" style={styles.summary}>
        <View style={styles.summaryHead}>
          <Text style={styles.summaryLabel}>Залишок · {MONTH_NAMES[now.getMonth()].toLowerCase()}</Text>
          <View style={styles.daysPill}>
            <Text style={styles.daysText}>
              {daysLeft === 0 ? "останній день" : `ще ${daysLeft} дн.`}
            </Text>
          </View>
        </View>

        {loading && !stats ? (
          <ActivityIndicator color={theme.olive} style={styles.loader} />
        ) : (
          <Text style={[styles.summaryValue, stats && stats.balance < 0 && styles.negative]}>
            {stats ? signedMoney(stats.balance) : "—"}
          </Text>
        )}

        {spentShare !== null && (
          <View style={styles.meter}>
            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  {
                    width: `${Math.min(spentShare, 1) * 100}%`,
                    backgroundColor: overspent ? theme.negative : theme.olive,
                  },
                ]}
              />
            </View>
            <Text style={styles.meterText}>
              {overspent
                ? `Витрати перевищили дохід на ${money(stats!.total_expenses - stats!.total_income)}`
                : `Витрачено ${Math.round(spentShare * 100)}% доходу`}
            </Text>
          </View>
        )}

        <View style={styles.flows}>
          <View style={styles.flow}>
            <Text style={styles.flowLabel}>Надійшло</Text>
            <Text style={[styles.flowValue, styles.positive]}>{stats ? money(stats.total_income) : "—"}</Text>
          </View>
          <View style={styles.flow}>
            <Text style={styles.flowLabel}>Витрачено</Text>
            <Text style={styles.flowValue}>{stats ? money(stats.total_expenses) : "—"}</Text>
          </View>
          <View style={styles.flow}>
            <Text style={styles.flowLabel}>У середньому</Text>
            <Text style={styles.flowValue}>{stats ? `${money(stats.avg_daily_expense)}/день` : "—"}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.buttons}>
        <Pressable
          onPress={() => push({ name: "add", kind: "expense" })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bigButton, styles.expenseButton, pressed && styles.pressed]}
        >
          <Ionicons name="remove" size={20} color="#fff" />
          <Text style={styles.bigButtonText}>Витрата</Text>
        </Pressable>
        <Pressable
          onPress={() => push({ name: "add", kind: "income" })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bigButton, styles.incomeButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color={theme.oliveDeep} />
          <Text style={[styles.bigButtonText, styles.incomeButtonText]}>Дохід</Text>
        </Pressable>
      </View>

      {error && <Text style={ui.error}>{error}</Text>}

      {categories.length > 0 && (
        <>
          <BlockTitle title="Куди йдуть гроші" action="Детальніше" onAction={() => switchTab("analytics")} />
          <Card onPress={() => switchTab("analytics")} label="Структура витрат">
            <View style={styles.stack}>
              {categories.map((c) => (
                <View
                  key={c.category}
                  style={{ flex: c.amount / Math.max(totalExpenses, 1), backgroundColor: categoryColor(c.category) }}
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
        </>
      )}

      <View style={styles.assistant}>
        <View style={styles.assistantHead}>
          <View style={styles.assistantIcon}>
            <Ionicons name="sparkles" size={18} color={theme.gold} />
          </View>
          <View style={styles.assistantText}>
            <Text style={styles.assistantTitle}>Запитайте Крону</Text>
            <Text style={styles.assistantSub}>Про суми, звички й навіть настрій покупок</Text>
          </View>
        </View>
        {QUESTIONS.map((q) => (
          <Pressable
            key={q}
            onPress={() => ask(q)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.question, pressed && styles.pressed]}
          >
            <Text style={styles.questionText}>{q}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.gold} />
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
                    <Text style={styles.limitName}>{budget.category}</Text>
                    <Text style={[styles.limitLeft, over && styles.negative]}>
                      {over ? `+${money(budget.spent - budget.limit)}` : money(budget.limit - budget.spent)}
                    </Text>
                    <Text style={styles.limitHint}>{over ? "понад ліміт" : "ще можна"}</Text>
                    <View style={styles.limitTrack}>
                      <View
                        style={[
                          styles.limitFill,
                          { width: `${share * 100}%`, backgroundColor: over ? theme.negative : categoryColor(budget.category) },
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
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  topText: { flex: 1 },
  date: { color: theme.inkSoft, fontSize: 13, textTransform: "capitalize" },
  hello: { color: theme.ink, fontSize: 24, fontWeight: "700", marginTop: 2 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 19, fontWeight: "700", color: "#fff" },
  pressed: { opacity: 0.8 },
  summary: { gap: 6, borderWidth: 1, borderColor: theme.lineSoft },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: theme.inkSoft, fontSize: 14 },
  daysPill: { backgroundColor: theme.oliveTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  daysText: { color: theme.oliveDeep, fontSize: 12, fontWeight: "600" },
  loader: { alignSelf: "flex-start", marginVertical: 14 },
  summaryValue: { color: theme.ink, fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  negative: { color: theme.negative },
  positive: { color: theme.positive },
  meter: { gap: 6, marginTop: 4 },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: theme.lineSoft, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 4 },
  meterText: { color: theme.inkSoft, fontSize: 12 },
  flows: {
    flexDirection: "row",
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.lineSoft,
  },
  flow: { flex: 1, gap: 2 },
  flowLabel: { color: theme.inkSoft, fontSize: 12 },
  flowValue: { color: theme.ink, fontSize: 14, fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 10 },
  bigButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
  },
  expenseButton: { backgroundColor: theme.olive },
  incomeButton: { backgroundColor: theme.oliveTint },
  bigButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  incomeButtonText: { color: theme.oliveDeep },
  stack: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, rowGap: 8 },
  legendItem: { width: "50%", flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendName: { flex: 1, color: theme.inkSoft, fontSize: 13, textTransform: "capitalize" },
  legendValue: { color: theme.ink, fontSize: 13, fontWeight: "600" },
  assistant: { backgroundColor: theme.goldTint, borderRadius: 18, padding: 16, gap: 10 },
  assistantHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  assistantIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  assistantText: { flex: 1 },
  assistantTitle: { color: theme.ink, fontSize: 15, fontWeight: "700" },
  assistantSub: { color: theme.inkSoft, fontSize: 12, marginTop: 1 },
  question: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  questionText: { flex: 1, color: theme.ink, fontSize: 14 },
  limits: { gap: 10, paddingRight: 4 },
  limit: { width: 140, backgroundColor: theme.surface, borderRadius: 16, padding: 14, gap: 2 },
  limitName: { color: theme.inkSoft, fontSize: 13, textTransform: "capitalize" },
  limitLeft: { color: theme.ink, fontSize: 18, fontWeight: "700", marginTop: 4 },
  limitHint: { color: theme.inkSoft, fontSize: 11 },
  limitTrack: { height: 5, borderRadius: 3, backgroundColor: theme.lineSoft, overflow: "hidden", marginTop: 8 },
  limitFill: { height: 5, borderRadius: 3 },
  setLimits: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  setLimitsText: { flex: 1, color: theme.oliveDeep, fontSize: 14, fontWeight: "500" },
  recent: { paddingVertical: 6, paddingHorizontal: 10 },
});
