import { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@finance/shared";
import { useAuth } from "@/AuthContext";
import { useNav, useScreen } from "@/navigation/context";
import { Card, PrimaryButton, ScreenHeader, ui } from "@/ui";
import { fonts, theme } from "@/theme";

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Не вдалося виконати дію. Спробуйте ще раз";
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  isNew,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  isNew?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={isNew ? "newPassword" : "password"}
      />
    </View>
  );
}

/**
 * Пароль, сесії й видалення акаунта.
 *
 * Пароль для видалення вводиться в полі на сторінці, а не в Alert.prompt:
 * той є лише на iOS, а застосунок працює й на Android.
 */
export function AccountScreen() {
  const { changePassword, logoutAll, deleteAccount } = useAuth();
  const { close, showToast } = useNav();
  const screen = useScreen();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const savePassword = async () => {
    if (next.length < 8) {
      setPasswordError("Новий пароль має бути щонайменше 8 символів");
      return;
    }
    setBusy(true);
    setPasswordError(null);
    try {
      await changePassword(current, next);
      close(screen.id);
      showToast({ kind: "success", text: "Пароль змінено. Інші пристрої вийшли з акаунта" });
    } catch (error) {
      setPasswordError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmLogoutAll = () =>
    Alert.alert("Вийти на всіх пристроях?", "Усі сесії, включно з цією, завершаться. Увійти можна тим самим паролем.", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Вийти всюди",
        style: "destructive",
        onPress: () => {
          logoutAll().catch((error) => showToast({ kind: "error", text: messageOf(error) }));
        },
      },
    ]);

  // Друге підтвердження поверх пароля: дію не можна скасувати.
  const confirmDelete = () =>
    Alert.alert("Видалити акаунт назавжди?", "Операції, ліміти й розмова з асистентом зникнуть без можливості відновлення.", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Видалити",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setDeleteError(null);
          try {
            await deleteAccount(deletePassword);
          } catch (error) {
            setDeleteError(messageOf(error));
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="padding">
      <ScreenHeader title="Пароль і безпека" />
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.title}>Змінити пароль</Text>
          <PasswordField label="ПОТОЧНИЙ ПАРОЛЬ" value={current} onChange={setCurrent} />
          <PasswordField label="НОВИЙ ПАРОЛЬ" value={next} onChange={setNext} placeholder="щонайменше 8 символів" isNew />
          {passwordError && (
            <Text style={ui.error} accessibilityRole="alert">
              {passwordError}
            </Text>
          )}
          <PrimaryButton label="Зберегти пароль" onPress={savePassword} disabled={busy || !current || !next} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.title}>Сесії</Text>
          <Text style={styles.hint}>Якщо входили з чужого пристрою або загубили телефон — завершіть усі сесії.</Text>
          <PrimaryButton label="Вийти на всіх пристроях" onPress={confirmLogoutAll} disabled={busy} tone="soft" />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.title, styles.danger]}>Видалити акаунт</Text>
          <Text style={styles.hint}>Буде видалено акаунт і всі дані. Скасувати це не можна.</Text>
          <PasswordField label="ПАРОЛЬ ДЛЯ ПІДТВЕРДЖЕННЯ" value={deletePassword} onChange={setDeletePassword} />
          {deleteError && (
            <Text style={ui.error} accessibilityRole="alert">
              {deleteError}
            </Text>
          )}
          <PrimaryButton label="Видалити акаунт" onPress={confirmDelete} disabled={busy || !deletePassword} tone="danger" />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  title: { fontSize: 17, fontFamily: fonts.display, color: theme.ink },
  danger: { color: theme.negative },
  hint: { fontSize: 14, color: theme.inkSoft, lineHeight: 20 },
  field: { gap: 7 },
  label: { fontSize: 11, color: theme.muted, fontFamily: fonts.mono, letterSpacing: 1.6 },
  input: {
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.ink,
    backgroundColor: theme.surface,
  },
});
