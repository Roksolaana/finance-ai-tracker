import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Transaction } from "@finance/shared";
import { categoryColor, categoryIcon, signedMoney, type IconName } from "@/format";
import { useCanGoBack, useNav } from "@/navigation/context";
import { theme } from "@/theme";

/** Шапка сторінки. На вкладених сторінках сама показує кнопку «назад». */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const canGoBack = useCanGoBack();
  const { pop } = useNav();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {canGoBack && (
        <Pressable
          onPress={pop}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </Pressable>
      )}
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  const color = categoryColor(category);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}1F`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={categoryIcon(category)} size={size * 0.5} color={color} />
    </View>
  );
}

/** Біла картка. З onPress — натискається й показує стрілку переходу. */
export function Card({
  children,
  onPress,
  style,
  label,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

export function BlockTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.blockTitle}>
      <Text style={styles.blockTitleText}>{title}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={styles.blockAction}>
          <Text style={styles.blockActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.olive} />
        </Pressable>
      )}
    </View>
  );
}

export function TransactionRow({ transaction, onPress }: { transaction: Transaction; onPress: () => void }) {
  const income = transaction.amount > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Відкрити операцію"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <CategoryIcon category={transaction.category} />
      <View style={styles.rowText}>
        <Text style={styles.rowNote} numberOfLines={1}>
          {transaction.note ?? transaction.category}
        </Text>
        <Text style={styles.rowCategory}>{transaction.category}</Text>
      </View>
      <Text style={[styles.rowAmount, income && styles.positive]}>{signedMoney(transaction.amount)}</Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  text,
  action,
  onAction,
}: {
  icon: IconName;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={theme.olive} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" style={styles.emptyButton}>
          <Text style={styles.emptyButtonText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger" | "soft";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        tone === "danger" && styles.buttonDanger,
        tone === "soft" && styles.buttonSoft,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          tone === "danger" && styles.buttonDangerText,
          tone === "soft" && styles.buttonSoftText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  error: {
    backgroundColor: theme.negativeTint,
    color: theme.negative,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.lineSoft,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink },
  subtitle: { fontSize: 13, color: theme.inkSoft, marginTop: 1 },
  pressed: { opacity: 0.75 },
  card: { backgroundColor: theme.surface, borderRadius: 18, padding: 16 },
  blockTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  blockTitleText: { fontSize: 16, fontWeight: "700", color: theme.ink },
  blockAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
  blockActionText: { color: theme.olive, fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  rowPressed: { backgroundColor: theme.surfaceSoft, borderRadius: 12 },
  rowText: { flex: 1 },
  rowNote: { color: theme.ink, fontSize: 15 },
  rowCategory: { color: theme.inkSoft, fontSize: 13, marginTop: 2 },
  rowAmount: { color: theme.ink, fontWeight: "600", fontSize: 15 },
  positive: { color: theme.positive },
  empty: { alignItems: "center", gap: 12, paddingVertical: 28, paddingHorizontal: 24 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.oliveTint,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: theme.inkSoft, textAlign: "center", fontSize: 14, lineHeight: 20 },
  emptyButton: { backgroundColor: theme.olive, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  emptyButtonText: { color: "#fff", fontWeight: "600" },
  button: { backgroundColor: theme.olive, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  buttonDanger: { backgroundColor: theme.negativeTint },
  buttonSoft: { backgroundColor: theme.oliveTint },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonDangerText: { color: theme.negative },
  buttonSoftText: { color: theme.oliveDeep },
});
