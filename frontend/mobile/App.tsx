import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/AuthContext";
import { theme } from "@/theme";
import { AuthScreen } from "@/screens/AuthScreen";
import { Navigator } from "@/navigation/Navigator";
import { EmptyState } from "@/ui";

function Gate() {
  const { user, checking, offline, retry, logout } = useAuth();

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.olive} />
      </View>
    );
  }
  // Вхід збережено, але сервер не відповів: екран входу тут збив би з
  // пантелику — людина подумала б, що її вилогінило.
  if (!user && offline) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="cloud-offline-outline"
          text="Немає зʼєднання із сервером. Перевірте, що телефон у тій самій мережі, що й сервер"
          action="Спробувати знову"
          onAction={retry}
        />
        <Pressable onPress={logout} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.other}>Увійти в інший акаунт</Text>
        </Pressable>
      </View>
    );
  }
  return user ? <Navigator /> : <AuthScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  other: { color: theme.olive, fontSize: 14, fontWeight: "600" },
});
