import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { cachedGet, smartPost } from "../../lib/offline";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const TOPICS = [
  { id: "all", label: "Tous", emoji: "🌸" },
  { id: "baby_blues", label: "Baby blues", emoji: "💙" },
  { id: "depression", label: "Dépression", emoji: "💜" },
  { id: "allaitement", label: "Allaitement", emoji: "🍼" },
  { id: "perinee", label: "Périnée", emoji: "🌺" },
  { id: "couple", label: "Couple", emoji: "💑" },
  { id: "fatigue", label: "Fatigue", emoji: "😪" },
  { id: "general", label: "Général", emoji: "👏" },
];

export default function Testimonials() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("all");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newTopic, setNewTopic] = useState("general");

  const load = async () => {
    try {
      const r = await cachedGet(`/postpartum/testimonials${topic !== "all" ? `?topic=${topic}` : ""}`);
      setItems(r.data || []);
    } catch {}
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [topic]));

  const submit = async () => {
    if (newContent.trim().length < 30) return Alert.alert("Trop court", "Minimum 30 caractères. Prenez votre temps.");
    try {
      setBusy(true);
      await smartPost("/postpartum/testimonials", { content: newContent, topic: newTopic });
      Alert.alert("💗 Merci pour votre courage", "Votre témoignage sera publié après modération (24h max). Vous resterez anonyme.");
      setNewContent(""); setNewTopic("general"); setModal(false);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setBusy(false); }
  };

  const like = async (id: string) => {
    try {
      await smartPost(`/postpartum/testimonials/${id}/like`, {});
      load();
    } catch {}
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      {/* Filtre topics */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.topicsScroll} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {TOPICS.map(t => (
          <TouchableOpacity key={t.id} style={[s.topicChip, topic === t.id && s.topicChipOn]} onPress={() => setTopic(t.id)}>
            <Text style={s.topicEmoji}>{t.emoji}</Text>
            <Text style={[s.topicLbl, topic === t.id && { color: "#fff" }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
        <View style={s.intro}>
          <Text style={s.introTxt}>✨ Vous n'êtes pas seule. Voici des témoignages d'autres mamans, sans jugement.</Text>
        </View>
        {items.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 50 }}>💬</Text>
            <Text style={s.emptyTitle}>Soyez la première à témoigner</Text>
            <Text style={s.emptyTxt}>Partagez votre expérience. Vous resterez anonyme. Ça aidera d'autres femmes.</Text>
          </View>
        ) : items.map((t: any) => (
          <View key={t.id} style={s.testimony}>
            <View style={s.testHead}>
              <Text style={s.testTopic}>{(TOPICS.find(x => x.id === t.topic) || TOPICS[0]).emoji} {(TOPICS.find(x => x.id === t.topic) || TOPICS[0]).label}</Text>
              {t.week_pp ? <Text style={s.testWeek}>SA {t.week_pp}</Text> : null}
            </View>
            <Text style={s.testContent}>« {t.content} »</Text>
            <TouchableOpacity style={s.likeBtn} onPress={() => like(t.id)}>
              <Ionicons name="heart" size={16} color="#EC4899" />
              <Text style={s.likeTxt}>{t.likes || 0} cœurs</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => setModal(true)}>
        <Ionicons name="create" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalWrap}>
          <ScrollView style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Partager mon témoignage</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={26} /></TouchableOpacity>
            </View>
            <Text style={s.modalSub}>Votre identité reste 100% anonyme. Vous aiderez d'autres mamans à se sentir moins seules.</Text>

            <Text style={s.label}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {TOPICS.filter(t => t.id !== "all").map(t => (
                  <TouchableOpacity key={t.id} style={[s.topicChip, newTopic === t.id && s.topicChipOn]} onPress={() => setNewTopic(t.id)}>
                    <Text style={s.topicEmoji}>{t.emoji}</Text>
                    <Text style={[s.topicLbl, newTopic === t.id && { color: "#fff" }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.label}>Votre témoignage (min. 30 caractères)</Text>
            <TextInput
              style={s.textArea}
              value={newContent}
              onChangeText={setNewContent}
              multiline
              maxLength={2000}
              placeholder="Écrivez ici. Tout est permis : votre histoire, vos doutes, ce qui vous a aidée…"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={s.charCount}>{newContent.length} / 2000</Text>

            <TouchableOpacity style={[s.submitBtn, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy}>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={s.submitTxt}>{busy ? "Envoi..." : "Publier (modéré en 24h)"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FDF2F8" },
  topicsScroll: { backgroundColor: "#fff", maxHeight: 60 },
  topicChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: "#FCE7F3" },
  topicChipOn: { backgroundColor: "#EC4899" },
  topicEmoji: { fontSize: 14 },
  topicLbl: { color: "#831843", fontWeight: "700", fontSize: 12 },
  intro: { padding: 12, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md, marginBottom: 14 },
  introTxt: { color: "#831843", fontSize: 13, lineHeight: 18 },
  empty: { padding: SPACING.xl, alignItems: "center", backgroundColor: "#fff", borderRadius: RADIUS.lg },
  emptyTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16, marginTop: 12 },
  emptyTxt: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 18 },
  testimony: { padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.md, marginBottom: 10 },
  testHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  testTopic: { fontSize: 12, fontWeight: "800", color: "#EC4899" },
  testWeek: { fontSize: 11, color: COLORS.textMuted },
  testContent: { color: COLORS.textPrimary, lineHeight: 21, fontStyle: "italic" },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start", paddingVertical: 4 },
  likeTxt: { color: "#EC4899", fontSize: 12, fontWeight: "700" },
  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#EC4899", alignItems: "center", justifyContent: "center", elevation: 6 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#FDF2F8", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.lg, maxHeight: "90%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  modalSub: { color: COLORS.textSecondary, marginBottom: 14, lineHeight: 18, fontSize: 12 },
  label: { fontWeight: "700", color: COLORS.textPrimary, marginTop: 14, marginBottom: 8, fontSize: 13 },
  textArea: { backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, minHeight: 160, textAlignVertical: "top", color: COLORS.textPrimary },
  charCount: { textAlign: "right", color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EC4899", padding: 16, borderRadius: RADIUS.pill, marginTop: 20 },
  submitTxt: { color: "#fff", fontWeight: "800" },
});
