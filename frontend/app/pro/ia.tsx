import { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const PROMPTS = [
  { id: "diag", icon: "medical", label: "Aide au diagnostic", prompt: "Je suis professionnel de santé. Aide-moi à établir un diagnostic différentiel pour une patiente présentant : " },
  { id: "dose", icon: "flask", label: "Calcul de dose", prompt: "Calcule la posologie recommandée pour : " },
  { id: "protocole", icon: "document-text", label: "Protocole clinique", prompt: "Donne-moi le protocole clinique recommandé pour : " },
  { id: "reco", icon: "shield-checkmark", label: "Recommandations OMS", prompt: "Quelles sont les recommandations OMS actuelles pour : " },
  { id: "lettre", icon: "mail", label: "Lettre confrère", prompt: "Rédige une lettre à un confrère spécialiste pour le cas suivant : " },
  { id: "interpret", icon: "analytics", label: "Interprétation analyses", prompt: "Aide-moi à interpréter ces résultats d'analyse : " },
];

export default function AssistantIAPro() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([
    { role: "assistant", content: "Bonjour Docteur ! Je suis votre assistant IA spécialisé en santé maternelle et pédiatrique. Comment puis-je vous aider ?" },
  ]);
  const [loading, setLoading] = useState(false);
  const [sid] = useState(() => "pro-" + Date.now());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = async (text?: string) => {
    const msg = text ?? input;
    if (!msg.trim()) return;
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.post("/ai/chat", { session_id: sid, message: msg, mode: "pro" });
      setMessages((m) => [...m, { role: "assistant", content: data.response }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Désolé, une erreur s'est produite. " + formatError(e) }]);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>IA Pro</Text>
          <Text style={styles.sub}>Outils spécialisés professionnels</Text>
        </View>
        <View style={styles.iaIcon}>
          <Ionicons name="sparkles" size={18} color="#fff" />
        </View>
      </View>

      {/* Quick prompts */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 100 }} contentContainerStyle={{ padding: SPACING.lg, gap: 8 }}>
        {PROMPTS.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => send(p.prompt)} style={styles.promptCard}>
            <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.promptIcon}>
              <Ionicons name={p.icon as any} size={16} color="#fff" />
            </LinearGradient>
            <Text style={styles.promptLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.lg, gap: 10 }}>
          {messages.map((m, i) => (
            <View key={i} style={[styles.msgBubble, m.role === "user" ? styles.msgUser : styles.msgBot]}>
              <Text style={[styles.msgText, m.role === "user" && { color: "#fff" }]}>{m.content}</Text>
            </View>
          ))}
          {loading && <View style={[styles.msgBubble, styles.msgBot]}><ActivityIndicator color={COLORS.primary} /></View>}
        </ScrollView>
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Posez votre question clinique..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            testID="ia-pro-input"
          />
          <TouchableOpacity onPress={() => send()} disabled={loading} testID="ia-pro-send-btn">
            <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  iaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#A855F7", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  promptCard: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, ...SHADOW },
  promptIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  promptLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },
  msgBubble: { maxWidth: "85%", padding: 12, borderRadius: RADIUS.lg },
  msgUser: { backgroundColor: "#A855F7", alignSelf: "flex-end", borderBottomRightRadius: 4 },
  msgBot: { backgroundColor: COLORS.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  msgText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.textPrimary, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
