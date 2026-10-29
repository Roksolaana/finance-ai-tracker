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
import { TreeRings, KronaMark } from "@/rings";
import { fonts, theme } from "@/theme";

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
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { paddingTop: insets.top + 24 }]}>
          {/* Рівні кільця тут — лише образ: справжні з'являються на головній з даними. */}
          <TreeRings nets={[3, 5, 4, 7, 6, 9]} size={300} style={styles.heroRings} />
          <View style={styles.brand}>
            <KronaMark size={44} />
            <Text style={styles.brandName}>Крона</Text>
          </View>
          <Text style={styles.heroLabel}>ОБЛІК ОСОБИСТИХ ФІНАНСІВ</Text>
          <Text style={styles.heroTitle}>Гроші, що ростуть кільцями</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.eyebrow}>{isRegister ? "НОВИЙ АКАУНТ" : "З ПОВЕРНЕННЯМ"}</Text>
          <Text style={styles.title}>{isRegister ? "Посадімо ваше дерево" : "Увійдіть у Крону"}</Text>

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
              <Text style={styles.label}>ВАШЕ ІМʼЯ</Text>
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
            <Text style={styles.label}>EMAIL</Text>
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
            <Text style={styles.label}>ПАРОЛЬ</Text>
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
            style={({ pressed }) => [styles.primary, busy && styles.primaryDisabled, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{isRegister ? "Створити акаунт" : "Увійти"}</Text>
            )}
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  hero: {
    backgroundColor: theme.forest,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    paddingHorizontal: 24,
    paddingBottom: 32,
    overflow: "hidden",
  },
  heroRings: { position: "absolute", right: -110, bottom: -120 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { color: "#fff", fontSize: 20, fontFamily: fonts.display },
  heroLabel: { color: theme.oliveSoft, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1.8, marginTop: 56 },
  heroTitle: {
    color: "#fff",
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fonts.display,
    letterSpacing: -0.8,
    marginTop: 10,
    maxWidth: 280,
  },
  form: { paddingHorizontal: 20, paddingTop: 26, gap: 14 },
  eyebrow: { color: theme.muted, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1.8 },
  title: { color: theme.ink, fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, marginTop: -6 },
  segmented: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.lineSoft,
    marginTop: 4,
  },
  segment: { flex: 1, paddingVertical: 11, borderRadius: 14, alignItems: "center" },
  segmentActive: { backgroundColor: theme.night },
  segmentText: { color: theme.inkSoft, fontWeight: "500", fontSize: 15 },
  segmentTextActive: { color: "#fff" },
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
  error: {
    backgroundColor: theme.negativeTint,
    color: theme.negative,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
  },
  primary: {
    backgroundColor: theme.olive,
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 4,
  },
  primaryDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  primaryText: { color: "#fff", fontSize: 16, fontFamily: fonts.display },
});
