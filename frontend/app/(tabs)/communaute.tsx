import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const CATEGORIES = [
  { value: "toutes", label: "Toutes", icon: "\u{1F4AC}", color: "#9CA3AF" },
  { value: "grossesse", label: "Grossesse", icon: "\u{1F930}", color: "#EC4899" },
  { value: "accouchement", label: "Accouchement", icon: "\u{1F476}", color: "#A855F7" },
  { value: "allaitement", label: "Allaitement", icon: "\u{1F37C}", color: "#F59E0B" },
  { value: "post_partum", label: "Post-partum", icon: "\u{1F495}", color: "#F472B6" },
  { value: "nutrition", label: "Nutrition", icon: "\u{1F957}", color: "#10B981" },
  { value: "sante_enfant", label: "Santé enfant", icon: "\u{1F9D2}", color: "#3B82F6" },
  { value: "questions_specialistes", label: "Spécialistes", icon: "\u{1F468}\u200D\u2695\uFE0F", color: "#06B6D4" },
  { value: "general", label: "Général", icon: "\u{1F4AC}", color: "#6B7280" },
];

export default function Communaute() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("toutes");
  const [form, setForm] = useState({ title: "", content: "", category: "general" });
  const [commentModal, setCommentModal] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/community");
      setPosts(data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const createPost = async () => {
    if (!form.title || !form.content) return Alert.alert("Champs requis", "Titre et contenu requis");
    try {
      await api.post("/community", form);
      setForm({ title: "", content: "", category: "general" });
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const toggleLike = async (pid: string) => {
    try { await api.post(`/community/${pid}/like`); load(); } catch {}
  };

  const addComment = async (pid: string) => {
    if (!commentText.trim()) return;
    try {
      await api.post(`/community/${pid}/comment`, { content: commentText });
      setCommentText("");
      setCommentModal(null);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const filtered = posts.filter((p) => {
    const matchSearch = !search || (p.title?.toLowerCase().includes(search.toLowerCase()) || p.content?.toLowerCase().includes(search.toLowerCase()));
    const matchCat = selectedCat === "toutes" || p.category === selectedCat;
    return matchSearch && matchCat;
  });

  const stats = {
    total: posts.length,
    membres: new Set(posts.map((p) => p.user_id)).size,
    aujourdhui: posts.filter((p) => new Date(p.created_at).toDateString() === new Date().toDateString()).length,
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header gradient amber-orange */}
      <LinearGradient colors={["#FEF3C7", "#FFEDD5"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <LinearGradient colors={["#F59E0B", "#EA580C"]} style={styles.headerIcon}>
              <Ionicons name="chatbubbles" size={24} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Communauté</Text>
              <Text style={styles.headerSub}>Partagez et échangez</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setModal(true)} testID="new-post-btn">
            <LinearGradient colors={["#F59E0B", "#EA580C"]} style={styles.headerBtn}>
              <Ionicons name="add" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Discussions</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.membres}</Text>
            <Text style={styles.statLabel}>Membres</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.aujourdhui}</Text>
            <Text style={styles.statLabel}>Aujourd'hui</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une discussion..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.value}
            onPress={() => setSelectedCat(c.value)}
            style={[
              styles.catChip,
              selectedCat === c.value && { backgroundColor: c.color, borderColor: c.color },
            ]}
          >
            <Text style={[styles.catChipText, selectedCat === c.value && { color: "#fff" }]}>
              {c.icon} {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Posts list */}
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingTop: 4, paddingBottom: 60 }}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune discussion</Text>
            <Text style={styles.emptyText}>Soyez le premier à publier !</Text>
          </View>
        ) : (
          filtered.map((p) => {
            const cat = CATEGORIES.find((c) => c.value === p.category) || CATEGORIES[CATEGORIES.length - 1];
            const liked = (p.likes || []).includes(user?.id);
            const isPro = p.user_role === "professionnel";
            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={[styles.userAvatar, { backgroundColor: cat.color + "22" }]}>
                    <Text style={[styles.userAvatarText, { color: cat.color }]}>
                      {(p.user_name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.userName}>{p.user_name || "Anonyme"}</Text>
                      {isPro && (
                        <View style={styles.proBadge}>
                          <Ionicons name="medical" size={9} color="#fff" />
                          <Text style={styles.proBadgeText}>PRO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.userMeta}>{new Date(p.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                  <View style={[styles.catTag, { backgroundColor: cat.color + "22" }]}>
                    <Text style={[styles.catTagText, { color: cat.color }]}>{cat.icon} {cat.label}</Text>
                  </View>
                </View>
                <Text style={styles.postTitle}>{p.title}</Text>
                <Text style={styles.postContent}>{p.content}</Text>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(p.id)}>
                    <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? "#EC4899" : COLORS.textSecondary} />
                    <Text style={[styles.actionText, liked && { color: "#EC4899" }]}>{(p.likes || []).length}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentModal(p.id)}>
                    <Ionicons name="chatbubble-outline" size={18} color={COLORS.textSecondary} />
                    <Text style={styles.actionText}>{(p.comments || []).length}</Text>
                  </TouchableOpacity>
                </View>
                {(p.comments || []).length > 0 && (
                  <View style={styles.commentsList}>
                    {(p.comments || []).slice(-2).map((c: any) => (
                      <View key={c.id} style={styles.commentRow}>
                        <View style={styles.commentAvatar}><Text style={styles.commentAvatarText}>{(c.user_name || "?").charAt(0).toUpperCase()}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.commentName}>{c.user_name}</Text>
                          <Text style={styles.commentText}>{c.content}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Create post modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouvelle discussion</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Catégorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {CATEGORIES.filter((c) => c.value !== "toutes").map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => setForm({ ...form, category: c.value })}
                    style={[styles.catChip, { marginRight: 6 }, form.category === c.value && { backgroundColor: c.color, borderColor: c.color }]}
                  >
                    <Text style={[styles.catChipText, form.category === c.value && { color: "#fff" }]}>{c.icon} {c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.label}>Titre</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="Posez votre question..." placeholderTextColor={COLORS.textMuted} testID="post-title" />
              <Text style={styles.label}>Contenu</Text>
              <TextInput style={[styles.input, { height: 120, textAlignVertical: "top" }]} multiline value={form.content} onChangeText={(v) => setForm({ ...form, content: v })} placeholder="Détails, contexte, vos pensées..." placeholderTextColor={COLORS.textMuted} testID="post-content" />
              <TouchableOpacity onPress={createPost} testID="submit-post-btn">
                <LinearGradient colors={["#F59E0B", "#EA580C"]} style={styles.btnPrimary}>
                  <Text style={styles.btnPrimaryText}>Publier</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comment modal */}
      <Modal visible={!!commentModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Ajouter un commentaire</Text>
              <TouchableOpacity onPress={() => setCommentModal(null)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { height: 100, textAlignVertical: "top" }]} multiline value={commentText} onChangeText={setCommentText} placeholder="Votre réponse..." placeholderTextColor={COLORS.textMuted} />
            <TouchableOpacity onPress={() => commentModal && addComment(commentModal)}>
              <LinearGradient colors={["#F59E0B", "#EA580C"]} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Envoyer</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { padding: SPACING.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: { width: 50, height: 50, borderRadius: 18, alignItems: "center", justifyContent: "center", ...SHADOW },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#7C2D12" },
  headerSub: { fontSize: 12, color: "#9A3412", marginTop: 2 },
  headerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", ...SHADOW },
  statsRow: { flexDirection: "row", marginTop: 16, backgroundColor: "rgba(255,255,255,0.6)", borderRadius: RADIUS.md, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#7C2D12" },
  statLabel: { fontSize: 10, color: "#9A3412", marginTop: 2, fontWeight: "600" },
  statSep: { width: 1, backgroundColor: "rgba(124,45,18,0.2)" },

  searchRow: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  searchInputWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  catScroll: { marginTop: 10, marginBottom: 6, maxHeight: 40 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  catChipText: { fontSize: 12, fontWeight: "600", color: COLORS.textPrimary },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4 },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  userAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  userAvatarText: { fontWeight: "800", fontSize: 14 },
  userName: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  userMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  proBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#06B6D4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  proBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  catTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  catTagText: { fontSize: 10, fontWeight: "700" },
  postTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  postContent: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  actionsRow: { flexDirection: "row", gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  commentsList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 },
  commentRow: { flexDirection: "row", gap: 8 },
  commentAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.bgSecondary, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { fontSize: 11, fontWeight: "800", color: COLORS.textPrimary },
  commentName: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 12 },
  commentText: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary, fontSize: 14 },
  btnPrimary: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 18 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
