import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const SPECIALITES = [
  { id: "all", label: "Toutes", color: "#9CA3AF" },
  { id: "gyneco", label: "Gynécologue", color: "#EC4899" },
  { id: "pediatre", label: "Pédiatre", color: "#3B82F6" },
  { id: "sage_femme", label: "Sage-femme", color: "#A855F7" },
  { id: "nutritionniste", label: "Nutritionniste", color: "#10B981" },
  { id: "psy", label: "Psychologue", color: "#F59E0B" },
];

export default function QuestionsSpecialistes() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", specialite_cible: "gyneco" });

  const load = async () => {
    try {
      const params: any = {};
      if (filter !== "all") params.specialite = filter;
      const { data } = await api.get("/questions-specialistes", { params });
      setList(data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [filter]));

  const submit = async () => {
    if (!form.title || !form.content) return Alert.alert("Champs requis");
    try {
      await api.post("/questions-specialistes", form);
      setModal(false);
      setForm({ title: "", content: "", specialite_cible: "gyneco" });
      load();
      Alert.alert("Publié \u2713", "Votre question est visible par les professionnels");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#14B8A6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Questions aux spécialistes</Text>
          <Text style={styles.sub}>Posez vos questions aux pros de santé</Text>
        </View>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
        {SPECIALITES.map((s) => (
          <TouchableOpacity key={s.id} onPress={() => setFilter(s.id)} style={[styles.catChip, filter === s.id && { backgroundColor: s.color, borderColor: s.color }]}>
            <Text style={[styles.catChipText, filter === s.id && { color: "#fff" }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingTop: 6, paddingBottom: 60 }}>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="help-circle-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Aucune question</Text>
              <Text style={styles.emptyText}>Soyez la première à poser une question !</Text>
            </View>
          ) : (
            list.map((q) => {
              const spec = SPECIALITES.find((s) => s.id === q.specialite_cible) || SPECIALITES[0];
              return (
                <View key={q.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={[styles.avatar, { backgroundColor: spec.color + "22" }]}>
                      <Text style={[styles.avatarText, { color: spec.color }]}>{q.user_name?.charAt(0).toUpperCase() || "?"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{q.user_name || "Anonyme"}</Text>
                      <Text style={styles.userMeta}>{new Date(q.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                    </View>
                    {q.specialite_cible && (
                      <View style={[styles.tag, { backgroundColor: spec.color + "22" }]}>
                        <Text style={[styles.tagText, { color: spec.color }]}>{spec.label}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postTitle}>{q.title}</Text>
                  <Text style={styles.postContent}>{q.content}</Text>
                  <View style={styles.actions}>
                    <View style={styles.actionItem}>
                      <Ionicons name="heart-outline" size={16} color={COLORS.textSecondary} />
                      <Text style={styles.actionText}>{(q.likes || []).length}</Text>
                    </View>
                    <View style={styles.actionItem}>
                      <Ionicons name="chatbubble-outline" size={16} color={COLORS.textSecondary} />
                      <Text style={styles.actionText}>{(q.comments || []).length} réponse(s)</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Poser une question</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Spécialiste ciblé</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {SPECIALITES.filter((s) => s.id !== "all").map((s) => (
                  <TouchableOpacity key={s.id} onPress={() => setForm({ ...form, specialite_cible: s.id })} style={[styles.catChip, form.specialite_cible === s.id && { backgroundColor: s.color, borderColor: s.color }]}>
                    <Text style={[styles.catChipText, form.specialite_cible === s.id && { color: "#fff" }]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Titre *</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="Ex: Douleurs bas-ventre au 5ème mois" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.label}>Votre question *</Text>
              <TextInput style={[styles.input, { height: 140, textAlignVertical: "top" }]} multiline value={form.content} onChangeText={(v) => setForm({ ...form, content: v })} placeholder="Décrivez votre situation, symptômes..." placeholderTextColor={COLORS.textMuted} />
              <TouchableOpacity onPress={submit}>
                <LinearGradient colors={["#10B981", "#14B8A6"]} style={styles.btnPrimary}>
                  <Text style={styles.btnPrimaryText}>Publier ma question</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  catChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, ...SHADOW },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "800" },
  userName: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  userMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  tagText: { fontSize: 10, fontWeight: "800" },
  postTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  postContent: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary, fontSize: 14 },
  btnPrimary: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 18 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
