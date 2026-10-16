import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/AuthContext";
import { theme } from "@/theme";
import { AuthScreen } from "@/screens/AuthScreen";
import { Tabs } from "@/navigation/Tabs";

function Gate() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.olive} />
      </View>
    );
  }
  return user ? <Tabs /> : <AuthScreen />;
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
});
