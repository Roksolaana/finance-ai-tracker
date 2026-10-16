import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chatGreeting, quickPrompts, type ChatMessage, type ToolKind } from "@finance/shared";
import { chatApi } from "@/api";
import { theme } from "@/theme";

// Який шлях дав відповідь — показуємо явно, це суть роботи.
const TOOL_LABELS: Record<ToolKind, string> = {
  sql: "SQL-агрегація",
  rag: "Семантичний пошук",
  hybrid: "Гібрид: пошук + SQL",
};

let idCounter = 0;
function localId(): string {
  idCounter += 1;
  return `local-${Date.now()}-${idCounter}`;
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>(chatGreeting);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    chatApi
      .status()
      .then((value) => {
        setEnabled(value);
        setStatusFailed(false);
      })
      .catch(() => {
        // Недоступний сервер — не те саме, що невказаний ключ.
        setEnabled(false);
        setStatusFailed(true);
      });
  }, []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const outgoing: ChatMessage = {
      id: localId(),
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    const history = messages;
    setMessages((prev) => [...prev, outgoing]);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const reply = await chatApi.send(question, [...history, outgoing]);
      setMessages((prev) => [...prev, reply.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося отримати відповідь");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>AI-асистент</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={item.role === "user" ? styles.userWrap : styles.botWrap}>
            <View style={item.role === "user" ? styles.userBubble : styles.botBubble}>
              <Text style={item.role === "user" ? styles.userText : styles.botText}>{item.content}</Text>
            </View>
            {item.tool_call && (
              <Text style={styles.badge}>
                {TOOL_LABELS[item.tool_call.kind] ?? item.tool_call.name} ·{" "}
                {(item.tool_call.duration_ms / 1000).toFixed(1)} с
              </Text>
            )}
          </View>
        )}
        ListFooterComponent={
          <View>
            {sending && (
              <Text style={styles.thinking} accessibilityRole="alert">
                Асистент шукає відповідь…
              </Text>
            )}
            {messages.length === chatGreeting.length && !sending && (
              <View style={styles.prompts}>
                <Text style={styles.promptsTitle}>Приклади запитів</Text>
                {quickPrompts.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => send(prompt)}
                    disabled={!enabled || sending}
                    accessibilityRole="button"
                    style={[styles.prompt, (!enabled || sending) && styles.promptDisabled]}
                  >
                    <Text style={styles.promptText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom > 0 ? 8 : 12 }]}>
        {enabled === false && (
          <Text style={styles.notice}>
            {statusFailed
              ? "Не вдалося звʼязатися із сервером. Асистент недоступний."
              : "Асистент вимкнений: на сервері не задано ключ LLM."}
          </Text>
        )}
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!!enabled && !sending}
            placeholder="Запитайте про свої витрати…"
            placeholderTextColor={theme.muted}
            style={styles.input}
            maxLength={1000}
            accessibilityLabel="Запит до AI-асистента"
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!enabled || sending || !input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Надіслати"
            style={[styles.sendButton, (!enabled || sending || !input.trim()) && styles.sendDisabled]}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>↑</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "700", color: theme.ink },
  list: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  userWrap: { alignItems: "flex-end" },
  botWrap: { alignItems: "flex-start" },
  userBubble: {
    maxWidth: "88%",
    backgroundColor: theme.olive,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  botBubble: {
    maxWidth: "92%",
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.lineSoft,
  },
  userText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  botText: { color: theme.inkSoft, fontSize: 14, lineHeight: 21 },
  badge: { color: theme.olive, fontSize: 11, marginTop: 5, marginLeft: 4 },
  thinking: { color: theme.muted, fontSize: 12, marginTop: 8, marginLeft: 4 },
  prompts: { marginTop: 16, gap: 8 },
  promptsTitle: { fontSize: 11, color: theme.muted, textTransform: "uppercase", fontWeight: "600" },
  prompt: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  promptDisabled: { opacity: 0.5 },
  promptText: { color: theme.muted, fontSize: 13 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.lineSoft,
    backgroundColor: theme.surface,
    gap: 8,
  },
  notice: { backgroundColor: theme.goldTint, color: theme.gold, borderRadius: 10, padding: 9, fontSize: 12 },
  error: { backgroundColor: theme.negativeTint, color: theme.negative, borderRadius: 10, padding: 9, fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.ink,
    backgroundColor: theme.surfaceSoft,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: theme.line },
  sendText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
