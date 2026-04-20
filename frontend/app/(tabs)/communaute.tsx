import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Communaute() {
  const { user } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
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
    if (!form.title || !form.content) return Alert.alert("Titre et contenu requis");
    try {
      await api.post("/community", form);
      setForm({ title: "", content: "", category: "general" });
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const toggleLike = async (pid: string) => {
    try {
      await api.post(`/community/${pid}/like`);
      load();
    } catch {}
  };

  const addComment = async () => {
    if (!commentText || !commentModal) return;
    try {
      await api.post(`/community/${commentModal}/comment`, { content: commentText });
      setCommentText("");
      setCommentModal(null);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const currentPost = posts.find((p) => p.id === commentModal);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Communauté</Text>
        <TouchableOpacity style={styles.addHeader} onPress={() => setModal(true)} testID="new-post-btn">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
        {posts.length === 0 ? (
          <Text style={styles.empty}>Aucune publication pour le moment</Text>
        ) : (
          posts.map((p) => (
            <View key={p.id} style={styles.post} testID={`post-${p.id}`}>
              <View style={styles.postHead}>
                <View style={[styles.avatar, { backgroundColor: p.user_role === "professionnel" ? COLORS.secondary : COLORS.primary }]}>
                  <Text style={styles.avatarText}>{p.user_name?.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.postName}>{p.user_name}</Text>
                    {p.user_role === "professionnel" && (
                      <View style={styles.proBadge}>
                        <Ionicons name="shield-checkmark" size={10} color="#fff" />
                        <Text style={styles.proBadgeText}>Pro</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postDate}>{new Date(p.created_at).toLocaleDateString("fr-FR")}</Text>
                </View>
                <View style={styles.catChip}>
                  <Text style={styles.catText}>{p.category}</Text>
                </View>
              </View>
              <Text style={styles.postTitle}>{p.title}</Text>
              <Text style={styles.postContent}>{p.content}</Text>

              <View style={styles.postActions}>
                <TouchableOpacity style={styles.postAction} onPress={() => toggleLike(p.id)} testID={`like-${p.id}`}>
                  <Ionicons
                    name={p.likes?.includes(user?.id) ? "heart" : "heart-outline"}
                    size={20}
                    color={p.likes?.includes(user?.id) ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={styles.postActionText}>{p.likes?.length || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.postAction} onPress={() => setCommentModal(p.id)} testID={`comment-${p.id}`}>
                  <Ionicons name="chatbubble-outline" size={20} color={COLORS.textSecondary} />
                  <Text style={styles.postActionText}>{p.comments?.length || 0}</Text>
                </TouchableOpacity>
              </View>

              {(p.comments || []).slice(0, 2).map((c: any) => (
                <View key={c.id} style={styles.comment}>
                  <Text style={styles.commentName}>{c.user_name}</Text>
                  <Text style={styles.commentText}>{c.content}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* New post modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouvelle publication</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Titre</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} testID="post-title" />
            <Text style={styles.label}>Message</Text>
            <TextInput style={[styles.input, { height: 120 }]} multiline value={form.content} onChangeText={(v) => setForm({ ...form, content: v })} testID="post-content" />
            <Text style={styles.label}>Catégorie</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {["general", "grossesse", "allaitement", "enfant", "post-partum"].map((c) => (
                <TouchableOpacity key={c} style={[styles.catBtn, form.category === c && styles.catBtnActive]} onPress={() => setForm({ ...form, category: c })}>
                  <Text style={[styles.catBtnText, form.category === c && { color: "#fff" }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.btnPrimary} onPress={createPost} testID="save-post-btn">
              <Text style={styles.btnPrimaryText}>Publier</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comment modal */}
      <Modal visible={!!commentModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalCard, { maxHeight: "80%" }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Commentaires</Text>
              <TouchableOpacity onPress={() => setCommentModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {(currentPost?.comments || []).map((c: any) => (
                <View key={c.id} style={styles.commentFull}>
                  <Text style={styles.commentName}>{c.user_name}</Text>
                  <Text style={styles.commentText}>{c.content}</Text>
                  <Text style={styles.commentDate}>{new Date(c.created_at).toLocaleString("fr-FR")}</Text>
                </View>
              ))}
              {(!currentPost?.comments || currentPost.comments.length === 0) && (
                <Text style={styles.empty}>Soyez la première à commenter</Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Votre commentaire..."
                placeholderTextColor={COLORS.textMuted}
                value={commentText}
                onChangeText={setCommentText}
                testID="comment-input"
              />
              <TouchableOpacity style={styles.sendBtn} onPress={addComment} testID="send-comment-btn">
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  addHeader: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 30, fontStyle: "italic" },
  post: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  postName: { fontWeight: "700", color: COLORS.textPrimary },
  postDate: { color: COLORS.textMuted, fontSize: 11 },
  proBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: COLORS.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  proBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  catChip: { backgroundColor: COLORS.secondaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  catText: { color: COLORS.textSecondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  postTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  postContent: { color: COLORS.textSecondary, lineHeight: 20 },
  postActions: { flexDirection: "row", gap: 20, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  postAction: { flexDirection: "row", alignItems: "center", gap: 6 },
  postActionText: { color: COLORS.textSecondary, fontWeight: "600" },
  comment: { padding: 10, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md, marginTop: 6 },
  commentFull: { padding: 12, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md, marginBottom: 6 },
  commentName: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13 },
  commentText: { color: COLORS.textSecondary, marginTop: 2 },
  commentDate: { color: COLORS.textMuted, fontSize: 10, marginTop: 4 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  catBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  catBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catBtnText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sendBtn: { width: 48, height: 48, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
});
