import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Transaction } from "@finance/shared";
import { transactionsApi } from "@/api";
import { capitalize, signedMoney } from "@/format";
import { useNav, useScreen } from "@/navigation/context";
import { Card, CategoryIcon, PrimaryButton, ScreenHeader, ui } from "@/ui";
import { theme } from "@/theme";

function Field({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.field, !last && styles.fieldLine]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function TransactionScreen({ transaction: initial }: { transaction: Transaction }) {
  const { push, close, showToast, refresh } = useNav();
  const screen = useScreen();
  // Після редагування показуємо оновлені дані, а не ті, з якими відкрили.
  const [transaction, setTransaction] = useState(initial);
  const [busy, setBusy] = useState(false);

  const income = transaction.amount > 0;
  const spentAt = new Date(transaction.spent_at);

  // Без діалогу «Ви впевнені?»: помилкове видалення скасовує «Повернути»,
  // так само як на десктопі.
  const remove = async () => {
    setBusy(true);
    try {
      await transactionsApi.remove(transaction.id);
      refresh();
      close(screen.id);
      showToast({
        text: "Операцію видалено",
        kind: "success",
        action: {
          label: "Повернути",
          onPress: async () => {
            try {
              await transactionsApi.create({
                amount: transaction.amount,
                category: transaction.category,
                note: transaction.note,
                spent_at: transaction.spent_at,
              });
              refresh();
              showToast({ text: "Операцію повернуто", kind: "success" });
            } catch {
              showToast({ text: "Не вдалося повернути операцію", kind: "error" });
            }
          },
        },
      });
    } catch {
      setBusy(false);
      showToast({ text: "Не вдалося видалити. Перевірте зʼєднання", kind: "error" });
    }
  };

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Операція" />
      <ScrollView contentContainerStyle={ui.content}>
        <Card style={styles.hero}>
          <CategoryIcon category={transaction.category} size={60} />
          <Text style={[styles.amount, income && styles.income]}>{signedMoney(transaction.amount)}</Text>
          <Text style={styles.note}>{transaction.note ?? "Без нотатки"}</Text>
        </Card>

        <Card style={styles.fields}>
          <Field label="Категорія" value={capitalize(transaction.category)} />
          <Field label="Тип" value={income ? "Дохід" : "Витрата"} />
          <Field
            label="Дата"
            value={spentAt.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
          />
          <Field
            label="Час"
            value={spentAt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
            last
          />
        </Card>

        <PrimaryButton
          label="Редагувати"
          tone="soft"
          disabled={busy}
          onPress={() => push({ name: "add", edit: transaction, onSaved: setTransaction })}
        />
        <PrimaryButton label="Видалити" tone="danger" disabled={busy} onPress={remove} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingVertical: 24 },
  amount: { fontSize: 32, fontWeight: "700", color: theme.ink, marginTop: 6 },
  income: { color: theme.positive },
  note: { fontSize: 15, color: theme.inkSoft, textAlign: "center", lineHeight: 21, paddingHorizontal: 12 },
  fields: { paddingVertical: 4 },
  field: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 13 },
  fieldLine: { borderBottomWidth: 1, borderBottomColor: theme.lineSoft },
  fieldLabel: { color: theme.inkSoft, fontSize: 14 },
  fieldValue: { color: theme.ink, fontSize: 14, fontWeight: "500" },
});
