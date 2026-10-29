import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  chatGreeting,
  quickChips,
  quickPrompts,
  type ChatMessage,
  type Transaction,
} from "@finance/shared";
import { chatApi } from "@/api";
import { money } from "@/format";
import { fonts, theme } from "@/theme";
import { CategoryIcon } from "@/ui";
import { useNav, useScreen } from "@/navigation/context";

function FoundRecords({ items }: { items: Transaction[] }) {
  return (
    <View style={styles.found}>
      <Text style={styles.foundTitle}>ЗНАЙДЕНІ ЗАПИСИ · {items.length}</Text>
      {items.slice(0, 3).map((t) => (
        <View key={t.id} style={styles.foundRow}>
          <CategoryIcon category={t.category} size={34} />
          <Text style={styles.foundNote} numberOfLines={1}>
            {t.note ?? t.category}
          </Text>
          <Text style={styles.foundAmount}>{money(t.amount)}</Text>
        </View>
      ))}
      {items.length > 3 && <Text style={styles.foundMore}>…і ще {items.length - 3}</Text>}
    </View>
  );
}

let idCounter = 0;
function localId(): string {
  idCounter += 1;
  return `local-${Date.now()}-${idCounter}`;
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>(chatGreeting);
  const [found, setFound] = useState<Record<string, Transaction[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Вкладка лишається змонтованою, тож стан асистента й розмову
  // перевіряємо щоразу, коли її відкривають: сервер міг ожити, а на ноутбуці
  // могли дописати розмову.
  const { visible } = useScreen();
  const { pendingQuestion, takeQuestion } = useNav();
  // Росте з кожним надсиланням: історія, запитана до нього, вже застаріла.
  const sendCount = useRef(0);

  const sync = useCallback(() => {
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
    const startedAt = sendCount.current;
    chatApi
      .history()
      .then((history) => {
        if (startedAt !== sendCount.current) return;
        setMessages([...chatGreeting, ...history.messages]);
        setFound(history.transactions);
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    if (visible) sync();
  }, [visible, sync]);

  // Питання з підказки на головній. Чекаємо історію: інакше вона, прийшовши
  // пізніше, перезаписала б щойно надіслане питання.
  useEffect(() => {
    if (!pendingQuestion || !historyLoaded || enabled === null || sending) return;
    takeQuestion();
    if (!enabled) {
      setError("Асистент зараз недоступний, тому питання не надіслано. Спробуйте трохи згодом");
      return;
    }
    void send(pendingQuestion);
    // send змінюється на кожному рендері; запуск керується лише цими станами.
  }, [pendingQuestion, historyLoaded, enabled, sending, takeQuestion]);

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
    if (!question || sending || !historyLoaded) return;
    sendCount.current += 1;

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

  const canSend = !!enabled && !sending && historyLoaded;
  const started = messages.length > chatGreeting.length;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Асистент</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, enabled === false && styles.statusDotOff]} />
            <Text style={styles.subtitle}>питайте своїми словами</Text>
          </View>
        </View>
        {started && (
          <Pressable
            onPress={restart}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Почати розмову заново"
            hitSlop={8}
            style={({ pressed }) => [styles.restart, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={22} color={theme.inkSoft} />
          </Pressable>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          if (item.role === "user") {
            return (
              <View style={styles.userWrap}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.content}</Text>
                </View>
              </View>
            );
          }
          return (
            <View style={styles.botWrap}>
              <View style={styles.botBubble}>
                <Text style={styles.botText}>{item.content}</Text>
              </View>
              {found[item.id] && <FoundRecords items={found[item.id]} />}
            </View>
          );
        }}
        ListFooterComponent={
          <View>
            {sending && (
              <Text style={styles.thinking} accessibilityRole="alert">
                Асистент шукає відповідь…
              </Text>
            )}
            {!started && !sending && (
              <View style={styles.prompts}>
                <Text style={styles.promptsTitle}>ПРИКЛАДИ ЗАПИТІВ</Text>
                {quickPrompts.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => send(prompt)}
                    disabled={!canSend}
                    accessibilityRole="button"
                    style={[styles.prompt, !canSend && styles.promptDisabled]}
                  >
                    <Text style={styles.promptText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
      />

      <View style={styles.footer}>
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
        {/* Короткі підказки лишаються й посеред розмови. */}
        {started && !sending && (
          <View style={styles.chips}>
            {quickChips.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => send(chip)}
                disabled={!canSend}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, !canSend && styles.promptDisabled, pressed && styles.pressed]}
              >
                <Text style={styles.chipText}>{chip}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={canSend}
            placeholder="Запитайте про свої гроші…"
            placeholderTextColor={theme.muted}
            style={styles.input}
            maxLength={1000}
            accessibilityLabel="Запит до AI-асистента"
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!canSend || !input.trim()}
            accessibilityRole="button"
            accessibilityLabel="Надіслати"
            style={[styles.sendButton, (!canSend || !input.trim()) && styles.sendDisabled]}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={22} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  pressed: { opacity: 0.75 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 14 },
  headerText: { flex: 1 },
  title: { fontSize: 30, fontFamily: fonts.display, color: theme.ink, letterSpacing: -0.8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.positive },
  statusDotOff: { backgroundColor: theme.gold },
  subtitle: { fontSize: 13, color: theme.inkSoft },
  restart: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
  },
  list: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  userWrap: { alignItems: "flex-end" },
  botWrap: { alignItems: "stretch" },
  userBubble: {
    maxWidth: "88%",
    backgroundColor: theme.night,
    borderRadius: 22,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  botBubble: {
    alignSelf: "flex-start",
    maxWidth: "94%",
    backgroundColor: theme.surface,
    borderRadius: 22,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: theme.lineSoft,
  },
  userText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  botText: { color: theme.ink, fontSize: 15, lineHeight: 22 },
  found: {
    marginTop: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.line,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  foundTitle: { color: theme.muted, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1.6 },
  foundRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  foundNote: { flex: 1, color: theme.ink, fontSize: 14 },
  foundAmount: { color: theme.ink, fontSize: 13, fontFamily: fonts.monoMedium },
  foundMore: { color: theme.muted, fontSize: 12 },
  thinking: { color: theme.muted, fontSize: 12, marginTop: 8, marginLeft: 4 },
  prompts: { marginTop: 16, gap: 8 },
  promptsTitle: { fontSize: 11, color: theme.muted, fontFamily: fonts.mono, letterSpacing: 1.6 },
  prompt: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  promptDisabled: { opacity: 0.5 },
  promptText: { color: theme.inkSoft, fontSize: 14 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipText: { color: theme.ink, fontSize: 13 },
  notice: { backgroundColor: theme.goldTint, color: theme.gold, borderRadius: 12, padding: 10, fontSize: 12 },
  error: { backgroundColor: theme.negativeTint, color: theme.negative, borderRadius: 12, padding: 10, fontSize: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 24,
    padding: 6,
    paddingLeft: 16,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 15, color: theme.ink },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: theme.line },
});
