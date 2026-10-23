import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/AuthContext";
import { API_BASE_URL } from "@/api";
import { theme } from "@/theme";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (isRegister && password.length < 8) {
      setError("Пароль має містити щонайменше 8 символів");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password, displayName.trim());
      else await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося увійти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Text style={styles.logoMark}>✦</Text>
        </View>
        <Text style={styles.title}>Крона</Text>
        <Text style={styles.subtitle}>Облік особистих фінансів</Text>

        <View style={styles.card}>
          <View style={styles.segmented}>
            {[
              { key: false, label: "Вхід" },
              { key: true, label: "Реєстрація" },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setIsRegister(item.key);
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isRegister === item.key }}
                style={[styles.segment, isRegister === item.key && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, isRegister === item.key && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {isRegister && (
            <View style={styles.field}>
              <Text style={styles.label}>Ваше імʼя</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Роксолана"
                placeholderTextColor={theme.muted}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={isRegister ? "щонайменше 8 символів" : "••••••••"}
              placeholderTextColor={theme.muted}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}

          <Pressable
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.primary, busy && styles.primaryDisabled]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{isRegister ? "Створити акаунт" : "Увійти"}</Text>
            )}
          </Pressable>
        </View>

        {/* Видно, до якого бекенду підключається телефон — найчастіша причина
            проблем на показі: інша мережа або інша адреса машини. У зібраному
            застосунку користувачу ця адреса ні до чого. */}
        {__DEV__ && <Text style={styles.hint}>{API_BASE_URL}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { paddingHorizontal: 24 },
  logo: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: { color: "#fff", fontSize: 24 },
  title: { textAlign: "center", fontSize: 26, fontWeight: "700", color: theme.ink, marginTop: 12 },
  subtitle: { textAlign: "center", color: theme.muted, marginTop: 4, marginBottom: 24 },
  card: { backgroundColor: theme.surface, borderRadius: 20, padding: 20, gap: 14 },
  segmented: { flexDirection: "row", backgroundColor: theme.oliveTint, borderRadius: 12, padding: 4 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  segmentActive: { backgroundColor: theme.surface },
  segmentText: { color: theme.muted, fontWeight: "500" },
  segmentTextActive: { color: theme.ink },
  field: { gap: 6 },
  label: { fontSize: 12, color: theme.muted, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: theme.ink,
    backgroundColor: theme.surface,
  },
  error: {
    backgroundColor: theme.negativeTint,
    color: theme.negative,
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
  },
  primary: {
    backgroundColor: theme.olive,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  hint: { textAlign: "center", color: theme.muted, fontSize: 11, marginTop: 20 },
});
