import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CATEGORIES, dayKey, type Transaction, type TransactionCategory } from "@finance/shared";
import { transactionsApi } from "@/api";
import { dayTitle, money, monthLabel, signedMoney } from "@/format";
import { useNav, useReloadOnChange } from "@/navigation/context";
import { EmptyState, ScreenHeader, TransactionRow, ui } from "@/ui";
import { theme } from "@/theme";

type Kind = "all" | "expense" | "income";
type Sort = "date" | "amount";

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "expense", label: "Витрати" },
  { key: "income", label: "Доходи" },
];

export function TransactionsScreen({
  category: initialCategory,
  month,
}: {
  category?: TransactionCategory;
  /** Відкрито з аналітики місяця — показуємо лише цей місяць. */
  month?: string;
}) {
  const { push } = useNav();
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [category, setCategory] = useState<TransactionCategory | null>(initialCategory ?? null);
  const [sort, setSort] = useState<Sort>("date");

  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const list = month ? await transactionsApi.inMonth(month) : await transactionsApi.list();
      if (id !== request.current) return;
      setItems(list);
      setError(null);
    } catch (err) {
      if (id !== request.current) return;
      setError(err instanceof Error ? err.message : "Не вдалося завантажити операції");
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((t) => {
      if (kind === "expense" && t.amount >= 0) return false;
      if (kind === "income" && t.amount <= 0) return false;
      if (category && t.category !== category) return false;
      if (needle && !`${t.note ?? ""} ${t.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, query, kind, category]);

  // Підсумок рахується саме з того, що видно в списку, — інакше цифра
  // нагорі не збігалася б із тим, що людина гортає.
  const totals = useMemo(() => {
    let expenses = 0;
    let income = 0;
    for (const t of filtered) {
      if (t.amount < 0) expenses += -t.amount;
      else income += t.amount;
    }
    return { expenses, income };
  }, [filtered]);

  const sections = useMemo(() => {
    if (sort === "amount") {
      const data = [...filtered].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      return data.length ? [{ title: "Від найбільшої суми", total: null as number | null, data }] : [];
    }
    const byDay = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = dayKey(t.spent_at);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(t);
      else byDay.set(key, [t]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, data]) => ({
        title: dayTitle(key),
        total: data.reduce((sum, t) => sum + t.amount, 0) as number | null,
        data,
      }));
  }, [filtered, sort]);

  const filtersOn = query.trim() !== "" || kind !== "all" || category !== null;

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title="Операції"
        subtitle={month ? monthLabel(month) : undefined}
        right={
          <Pressable
            onPress={() => setSort((s) => (s === "date" ? "amount" : "date"))}
            accessibilityRole="button"
            accessibilityLabel={sort === "date" ? "Сортувати за сумою" : "Сортувати за датою"}
            style={styles.sort}
          >
            <Ionicons name={sort === "date" ? "calendar-outline" : "cash-outline"} size={16} color={theme.olive} />
            <Text style={styles.sortText}>{sort === "date" ? "За датою" : "За сумою"}</Text>
          </Pressable>
        }
      />

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={theme.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Пошук за нотаткою чи категорією"
          placeholderTextColor={theme.muted}
          style={styles.searchInput}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query !== "" && (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Очистити пошук">
            <Ionicons name="close-circle" size={18} color={theme.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {KINDS.map((item) => (
          <Chip key={item.key} label={item.label} selected={kind === item.key} onPress={() => setKind(item.key)} />
        ))}
        <View style={styles.chipDivider} />
        {CATEGORIES.map((item) => (
          <Chip
            key={item}
            label={item}
            selected={category === item}
            onPress={() => setCategory((current) => (current === item ? null : item))}
          />
        ))}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {filtersOn ? `Знайдено ${filtered.length}` : `Усього ${filtered.length}`} · витрати{" "}
          {money(totals.expenses)} · доходи {money(totals.income)}
        </Text>
        {filtersOn && (
          <Pressable
            onPress={() => {
              setQuery("");
              setKind("all");
              setCategory(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.reset}>Скинути</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={[ui.error, styles.error]}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={theme.olive} style={styles.loader} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
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
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            filtersOn ? (
              <EmptyState icon="search-outline" text="Нічого не знайдено. Спробуйте змінити фільтри." />
            ) : (
              <EmptyState
                icon="receipt-outline"
                text="Поки що немає жодної операції"
                action="Додати першу"
                onAction={() => push({ name: "add" })}
              />
            )
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.total !== null && <Text style={styles.sectionTotal}>{signedMoney(section.total)}</Text>}
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <View
              style={[
                styles.rowWrap,
                index === 0 && styles.rowFirst,
                index === section.data.length - 1 && styles.rowLast,
              ]}
            >
              <TransactionRow transaction={item} onPress={() => push({ name: "transaction", transaction: item })} />
            </View>
          )}
        />
      )}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipActive]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sort: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.oliveTint,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortText: { color: theme.oliveDeep, fontSize: 13, fontWeight: "600" },
  search: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: theme.ink },
  // Без flexShrink: 0 список нижче стискає рядок фільтрів і обрізає чіпи.
  chipsScroll: { flexGrow: 0, flexShrink: 0, marginTop: 10 },
  chips: { paddingHorizontal: 16, paddingVertical: 2, gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
  },
  chipActive: { backgroundColor: theme.olive, borderColor: theme.olive },
  chipText: { color: theme.inkSoft, fontSize: 13, textTransform: "capitalize" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  chipDivider: { width: 1, height: 22, backgroundColor: theme.line, marginHorizontal: 2 },
  summary: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  summaryText: { color: theme.inkSoft, fontSize: 12, flex: 1 },
  reset: { color: theme.olive, fontSize: 13, fontWeight: "600" },
  error: { marginHorizontal: 16, marginTop: 8 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", paddingTop: 16, paddingBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: theme.inkSoft },
  sectionTotal: { fontSize: 13, color: theme.inkSoft },
  rowWrap: { backgroundColor: theme.surface, paddingHorizontal: 10 },
  rowFirst: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 4 },
  rowLast: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingBottom: 4 },
});
