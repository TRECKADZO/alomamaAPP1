import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Chat() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/messages/${id}`);
      setMsgs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [msgs]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    setSending(true);
    try {
      const { data } = await api.post("/messages", { to_id: id, content: t });
      setMsgs((m) => [...m, data]);
    } catch { /* noop */ } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="chat-back-btn">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || "?").charAt(0)}</Text>
        </View>
        <Text style={styles.hname}>{decodeURIComponent(name || "")}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
            {msgs.length === 0 && (
              <Text style={styles.empty}>Démarrez la conversation</Text>
            )}
            {msgs.map((m) => (
              <View
                key={m.id}
                style={[styles.bubble, m.from_id === user?.id ? styles.mine : styles.theirs]}
              >
                <Text style={m.from_id === user?.id ? styles.mineText : styles.theirsText}>{m.content}</Text>
                <Text style={styles.time}>
                  {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Écrivez un message..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            testID="chat-input"
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || sending} testID="chat-send-btn">
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
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  hname: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  body: { padding: SPACING.lg, gap: 6 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 20, fontStyle: "italic" },
  bubble: { maxWidth: "80%", padding: 10, borderRadius: 16 },
  mine: { alignSelf: "flex-end", backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: COLORS.secondaryLight, borderBottomLeftRadius: 4 },
  mineText: { color: "#fff" },
  theirsText: { color: COLORS.textPrimary },
  time: { fontSize: 9, marginTop: 4, opacity: 0.6, color: "#fff" },
  inputBar: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "flex-end" },
  input: { flex: 1, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.textPrimary, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
});
