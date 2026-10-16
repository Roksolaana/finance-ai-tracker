import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORY_COLORS, type Transaction, type TransactionCategory } from "@finance/shared";
import { theme } from "@/theme";

function money(value: number): string {
  const abs = Math.abs(value);
  const digits = Number.isInteger(abs) ? 0 : 2;
  return `${abs.toLocaleString("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₴`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function TransactionDetail({
  transaction,
  onClose,
  onDelete,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!transaction) return null;

  const income = transaction.amount > 0;
  const spentAt = new Date(transaction.spent_at);
  const created = new Date(transaction.created_at);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрити" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.headline}>
            <View
              style={[
                styles.dot,
                { backgroundColor: CATEGORY_COLORS[transaction.category as TransactionCategory] ?? theme.muted },
              ]}
            />
            <Text style={[styles.amount, income && styles.amountIncome]}>
              {income ? "+" : "−"}
              {money(transaction.amount)}
            </Text>
          </View>

          <Text style={styles.note}>{transaction.note ?? "Без нотатки"}</Text>

          <View style={styles.fields}>
            <Field label="Категорія" value={transaction.category} />
            <Field label="Тип" value={income ? "Дохід" : "Витрата"} />
            <Field
              label="Дата"
              value={spentAt.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
            />
            <Field
              label="Час"
              value={spentAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
            />
            <Field
              label="Запис створено"
              value={created.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
            />
          </View>

          <Pressable
            onPress={() => onDelete(transaction)}
            accessibilityRole="button"
            style={styles.delete}
          >
            <Text style={styles.deleteText}>Видалити транзакцію</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
            <Text style={styles.closeText}>Закрити</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(35,38,28,0.35)" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    maxHeight: "80%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.line,
    marginBottom: 12,
  },
  body: { paddingHorizontal: 20, gap: 16 },
  headline: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  amount: { fontSize: 30, fontWeight: "700", color: theme.ink },
  amountIncome: { color: theme.positive },
  note: { fontSize: 15, color: theme.inkSoft, lineHeight: 21 },
  fields: { gap: 1, borderRadius: 14, overflow: "hidden", backgroundColor: theme.lineSoft },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: theme.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  fieldLabel: { color: theme.muted, fontSize: 13 },
  fieldValue: { color: theme.ink, fontSize: 13, fontWeight: "500", textTransform: "capitalize" },
  delete: { backgroundColor: theme.negativeTint, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  deleteText: { color: theme.negative, fontWeight: "600" },
  close: { paddingVertical: 12, alignItems: "center" },
  closeText: { color: theme.muted },
});
