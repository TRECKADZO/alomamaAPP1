import { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

interface Msg {
  role: "user" | "assistant";
  content: string;
  id: string;
}

export default function AssistantIA() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Bonjour 💛 Je suis votre assistante À lo Maman. Posez-moi vos questions sur la grossesse, l'allaitement, la santé de votre enfant, ou tout ce qui concerne votre bien-être. Je suis là pour vous aider !",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`s-${Date.now()}`).current;
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const txt = input.trim();
    if (!txt || loading) return;
    setInput("");
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: txt };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    try {
      const { data } = await api.post("/ai/chat", { session_id: sessionId, message: txt });
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: data.response }]);
    } catch {
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", content: "Désolée, une erreur s'est produite. Veuillez réessayer." }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const suggestions = [
    "Comment calmer les nausées du 1er trimestre ?",
    "Quels aliments éviter pendant l'allaitement ?",
    "Calendrier de vaccination du nourrisson ?",
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={20} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Assistante À lo Maman</Text>
          <Text style={styles.subtitle}>Conseils santé personnalisés</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messagesWrap}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleBot]}
              testID={`msg-${m.role}`}
            >
              {m.role === "assistant" && (
                <View style={styles.botMeta}>
                  <Ionicons name="sparkles" size={10} color={COLORS.primary} />
                  <Text style={styles.botMetaText}>Assistante IA</Text>
                </View>
              )}
              <Text style={m.role === "user" ? styles.userText : styles.botText}>{m.content}</Text>
            </View>
          ))}
          {loading && (
            <View style={[styles.bubble, styles.bubbleBot]}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}

          {messages.length === 1 && !loading && (
            <View style={styles.suggestions}>
              <Text style={styles.suggLabel}>💡 Questions suggérées</Text>
              {suggestions.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggItem}
                  onPress={() => setInput(s)}
                  testID={`suggestion-${i}`}
                >
                  <Text style={styles.suggText}>{s}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            blurOnSubmit
            onSubmitEditing={send}
            returnKeyType="send"
            testID="ia-input"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!input.trim() || loading}
            testID="ia-send-btn"
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 11, color: COLORS.textSecondary },
  messagesWrap: { padding: SPACING.lg, gap: 10, paddingBottom: 20 },
  bubble: { maxWidth: "85%", padding: 12, borderRadius: 20 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleBot: { alignSelf: "flex-start", backgroundColor: COLORS.secondaryLight, borderBottomLeftRadius: 4 },
  botMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  botMetaText: { fontSize: 9, color: COLORS.primary, fontWeight: "700", textTransform: "uppercase" },
  userText: { color: "#fff", lineHeight: 20 },
  botText: { color: COLORS.textPrimary, lineHeight: 20 },
  suggestions: { marginTop: 20 },
  suggLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 8 },
  suggItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  suggText: { flex: 1, color: COLORS.textPrimary, fontSize: 13 },
  inputBar: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "flex-end" },
  input: { flex: 1, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.textPrimary, maxHeight: 100, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
});
