import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  NO_TOOL_INFO,
  ROUTE_INFO,
  chatGreeting,
  quickPrompts,
  type ChatMessage,
  type Transaction,
} from "@finance/shared";
import { chatApi } from "@/api";
import { theme } from "@/theme";
import { ScreenHeader } from "@/ui";
import { useNav } from "@/navigation/context";

// Як отримано відповідь — відкривається кнопкою «i», щоб не заважати читати.
function HowAnswered({ message, found }: { message: ChatMessage; found?: Transaction[] }) {
  const call = message.tool_call;
  const route = call ? ROUTE_INFO[call.kind] : undefined;
  return (
    <View style={styles.details}>
      {route && call ? (
        <>
          <Text style={styles.detailsTitle}>{route.title}</Text>
          {route.steps.map((step, i) => (
            <Text key={step} style={styles.detailsText}>
              {i + 1}. {step}
            </Text>
          ))}
          <Text style={styles.detailsMeta}>
            {call.name} · {(call.duration_ms / 1000).toFixed(1)} с · записів: {found?.length ?? 0}
          </Text>
          {found?.slice(0, 5).map((t) => (
            <Text key={t.id} style={styles.detailsText} numberOfLines={1}>
              • {t.note ?? t.category} · {Math.abs(t.amount)} ₴
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.detailsText}>{NO_TOOL_INFO}</Text>
      )}
    </View>
  );
}

let idCounter = 0;
function localId(): string {
  idCounter += 1;
  return `local-${Date.now()}-${idCounter}`;
}

export function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(chatGreeting);
  const [found, setFound] = useState<Record<string, Transaction[]>>({});
  const [opened, setOpened] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
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
    // Вкладка перемонтовується при кожному переході, тож розмову беремо з
    // сервера. Не вийшло — лишається привітання, писати можна й так.
    chatApi
      .history()
      .then((history) => {
        setMessages([...chatGreeting, ...history.messages]);
        setFound(history.transactions);
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  // Питання з підказки на головній. Чекаємо історію: інакше вона, прийшовши
  // пізніше, перезаписала б щойно надіслане питання.
  const { pendingQuestion, takeQuestion } = useNav();
  useEffect(() => {
    if (!pendingQuestion || !historyLoaded || !enabled || sending) return;
    takeQuestion();
    void send(pendingQuestion);
    // send змінюється на кожному рендері; запуск керується лише цими станами.
  },[pendingQuestion, historyLoaded, enabled, sending, takeQuestion]);

  const restart = () => {
    Alert.alert("Почати розмову заново?", "Поточна розмова зникне на всіх пристроях.", [
      { text: "Скасувати", style: "cancel" },
      {
        text: "Почати заново",
        style: "destructive",
        onPress: async () => {
          try {
            await chatApi.clearHistory();
            setMessages(chatGreeting);
            setFound({});
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Не вдалося очистити розмову");
          }
        },
      },
    ]);
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const outgoing: ChatMessage = {
      id: localId(),
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, outgoing]);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const reply = await chatApi.send(question);
      setMessages((prev) => [...prev, reply.message]);
      if (reply.transactions.length) {
        setFound((prev) => ({ ...prev, [reply.message.id]: reply.transactions }));
      }
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
    >
      <ScreenHeader
        title="AI-асистент"
        subtitle="Питайте про свої гроші своїми словами"
        right={
          messages.length > chatGreeting.length ? (
            <Pressable
              onPress={restart}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Почати розмову заново"
              hitSlop={8}
              style={styles.restart}
            >
              <Ionicons name="refresh" size={20} color={theme.olive} />
            </Pressable>
          ) : undefined
        }
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          item.role === "user" ? (
            <View style={styles.userWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{item.content}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.botWrap}>
              <View style={styles.botBubble}>
                <Text style={styles.botText}>{item.content}</Text>
              </View>
              {!chatGreeting.some((m) => m.id === item.id) && (
                <Pressable
                  onPress={() => setOpened((current) => (current === item.id ? null : item.id))}
                  accessibilityRole="button"
                  accessibilityLabel="Як отримано відповідь"
                  accessibilityState={{ expanded: opened === item.id }}
                  hitSlop={10}
                  style={[styles.info, opened === item.id && styles.infoActive]}
                >
                  <Text style={[styles.infoText, opened === item.id && styles.infoTextActive]}>i</Text>
                </Pressable>
              )}
              {opened === item.id && <HowAnswered message={item} found={found[item.id]} />}
            </View>
          )
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

      <View style={[styles.footer, { paddingBottom: 12 }]}>
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
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  restart: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.oliveTint,
  },
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
  details: {
    maxWidth: "92%",
    marginTop: 6,
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: theme.oliveTint,
    gap: 3,
  },
  detailsTitle: { color: theme.oliveDeep, fontSize: 12, fontWeight: "600", marginBottom: 2 },
  detailsText: { color: theme.oliveDeep, fontSize: 12, lineHeight: 17 },
  detailsMeta: { color: theme.olive, fontSize: 11, marginTop: 4 },
  info: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginLeft: 6,
  },
  infoActive: { backgroundColor: theme.olive, borderColor: theme.olive },
  infoText: { color: theme.muted, fontSize: 11, fontWeight: "700", fontStyle: "italic" },
  infoTextActive: { color: "#fff" },
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
});
