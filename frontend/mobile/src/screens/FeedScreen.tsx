import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORY_COLORS, dayKey, monthKey, type Transaction } from "@finance/shared";
import { statsApi, transactionsApi } from "@/api";
import { theme } from "@/theme";
import { TransactionDetail } from "@/screens/TransactionDetail";

function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const digits = Number.isInteger(abs) ? 0 : 2;
  return `${abs.toLocaleString("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₴`;
}

function dayTitle(key: string): string {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  if (key === today) return "Сьогодні";
  if (key === yesterday) return "Вчора";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

export function FeedScreen({ dataVersion, onChanged }: { dataVersion: number; onChanged: () => void }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Transaction[]>([]);
  const [monthTotal, setMonthTotal] = useState<{ expenses: number; income: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([
        transactionsApi.list(),
        statsApi.month(monthKey(new Date())),
      ]);
      setItems(list);
      setMonthTotal({ expenses: stats.total_expenses, income: stats.total_income });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const sections = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const item of items) {
      const key = dayKey(item.spent_at);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, data]) => ({
        title: dayTitle(key),
        total: data.reduce((sum, t) => sum + t.amount, 0),
        data,
      }));
  }, [items]);

  const remove = (transaction: Transaction) => {
    Alert.alert("Видалити транзакцію?", transaction.note ?? transaction.category, [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Видалити",
        style: "destructive",
        onPress: async () => {
          try {
            await transactionsApi.remove(transaction.id);
            setItems((prev) => prev.filter((t) => t.id !== transaction.id));
            setSelected(null);
            onChanged();
          } catch (err) {
            Alert.alert("Не вдалося видалити", err instanceof Error ? err.message : "");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.olive} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Транзакції</Text>
        {monthTotal && (
          <Text style={styles.summary}>
            За місяць: витрати {formatMoney(monthTotal.expenses)} · доходи {formatMoney(monthTotal.income)}
          </Text>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
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
        ListEmptyComponent={
          <Text style={styles.empty}>Поки що немає записів. Додайте перший на вкладці «Додати».</Text>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionTotal}>
              {section.total < 0 ? "−" : "+"}
              {formatMoney(section.total)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(item)}
            accessibilityRole="button"
            accessibilityHint="Відкрити деталі транзакції"
            style={styles.row}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: CATEGORY_COLORS[item.category] ?? theme.muted },
              ]}
            />
            <View style={styles.rowText}>
              <Text style={styles.note} numberOfLines={1}>
                {item.note ?? item.category}
              </Text>
              <Text style={styles.category}>{item.category}</Text>
            </View>
            <Text style={[styles.amount, item.amount > 0 && styles.amountPositive]}>
              {item.amount < 0 ? "−" : "+"}
              {formatMoney(item.amount)}
            </Text>
          </Pressable>
        )}
      />

      <TransactionDetail transaction={selected} onClose={() => setSelected(null)} onDelete={remove} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink },
  summary: { color: theme.muted, fontSize: 12, marginTop: 4 },
  error: { marginHorizontal: 20, backgroundColor: theme.negativeTint, color: theme.negative, padding: 10, borderRadius: 12, fontSize: 13 },
  empty: { textAlign: "center", color: theme.muted, marginTop: 40, paddingHorizontal: 32, lineHeight: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: theme.muted, textTransform: "uppercase" },
  sectionTotal: { fontSize: 12, color: theme.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    marginHorizontal: 16,
    marginVertical: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1 },
  note: { color: theme.ink, fontSize: 14 },
  category: { color: theme.muted, fontSize: 12, marginTop: 2 },
  amount: { color: theme.ink, fontWeight: "600", fontSize: 14 },
  amountPositive: { color: theme.positive },
});
