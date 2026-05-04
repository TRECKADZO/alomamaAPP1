import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

// 📋 Modèles de messages rapides pour les professionnels (médical)
const PRO_TEMPLATES = [
  { id: "rdv", icon: "calendar", label: "Rappel RDV", text: "Bonjour, je vous rappelle votre rendez-vous prévu. Merci de confirmer votre présence." },
  { id: "results", icon: "document-text", label: "Résultats", text: "Bonjour, vos résultats d'examen sont disponibles. Pouvons-nous convenir d'une consultation ?" },
  { id: "traitement", icon: "medkit", label: "Traitement", text: "Bonjour, n'oubliez pas de suivre votre traitement tel que prescrit. En cas d'effets indésirables, contactez-moi." },
  { id: "suivi", icon: "heart", label: "Suivi grossesse", text: "Bonjour, comment vous sentez-vous ? Merci de me signaler tout symptôme inhabituel (contractions, saignements, œdèmes)." },
  { id: "vaccins", icon: "shield-checkmark", label: "Vaccin", text: "Bonjour, le prochain vaccin de votre enfant est dû prochainement. Merci de prendre RDV." },
  { id: "urgence", icon: "warning", label: "Urgent", text: "Important : Merci de me contacter rapidement ou de vous rendre aux urgences si les symptômes persistent." },
];

type ChatMessage = {
  id: string;
  from_id: string;
  content: string;
  created_at: string;
  attachment_base64?: string;
  attachment_name?: string;
  attachment_mime?: string;
};

export default function Chat() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; name: string; mime: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isPro = user?.role === "professionnel" || user?.role === "centre_sante";

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
    if (!t && !attachment) return;
    setSending(true);
    try {
      const body: any = { to_id: id, content: t };
      if (attachment) {
        body.attachment_base64 = attachment.base64;
        body.attachment_name = attachment.name;
        body.attachment_mime = attachment.mime;
      }
      const { data } = await api.post("/messages", body);
      setMsgs((m) => [...m, data]);
      setText("");
      setAttachment(null);
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  };

  const pickImage = async (fromCamera: boolean) => {
    setShowAttachMenu(false);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return Alert.alert("Permission refusée", "Autorisez l'accès pour continuer.");
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const b64 = asset.base64 || "";
      if (!b64) return Alert.alert("Erreur", "Impossible de lire l'image");
      setAttachment({
        base64: `data:image/jpeg;base64,${b64}`,
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        mime: "image/jpeg",
      });
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de sélectionner l'image");
    }
  };

  const pickDocument = async () => {
    setShowAttachMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      // Lecture base64 via FileSystem (legacy = compatible SDK 54)
      const FileSystem = await import("expo-file-system/legacy");
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" as any });
      if (!b64) return Alert.alert("Erreur", "Fichier illisible");
      setAttachment({
        base64: `data:${asset.mimeType || "application/pdf"};base64,${b64}`,
        name: asset.name || "document.pdf",
        mime: asset.mimeType || "application/pdf",
      });
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de sélectionner le document");
    }
  };

  const insertTemplate = (tmpl: typeof PRO_TEMPLATES[0]) => {
    const mamanFirstName = decodeURIComponent(name || "").split(" ")[0];
    const txt = tmpl.text.replace("Bonjour,", `Bonjour ${mamanFirstName},`);
    setText(txt);
    setShowTemplates(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="chat-back-btn">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || "?").charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hname} numberOfLines={1}>{decodeURIComponent(name || "")}</Text>
          <Text style={styles.hStatus}>{isPro ? "Patiente" : "Professionnel(le) de santé"}</Text>
        </View>
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
            {msgs.map((m) => {
              const mine = m.from_id === user?.id;
              const isImage = m.attachment_mime?.startsWith("image/");
              const isPdf = m.attachment_mime === "application/pdf" || m.attachment_name?.toLowerCase().endsWith(".pdf");
              return (
                <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {m.attachment_base64 ? (
                    isImage ? (
                      <Image source={{ uri: m.attachment_base64 }} style={styles.attachImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.fileRow}>
                        <Ionicons name={isPdf ? "document-text" : "document"} size={24} color={mine ? "#fff" : COLORS.primary} />
                        <Text style={[styles.fileName, mine && { color: "#fff" }]} numberOfLines={1}>
                          {m.attachment_name || "Fichier"}
                        </Text>
                      </View>
                    )
                  ) : null}
                  {m.content ? (
                    <Text style={mine ? styles.mineText : styles.theirsText}>{m.content}</Text>
                  ) : null}
                  <Text style={[styles.time, mine && { color: "rgba(255,255,255,0.8)" }]}>
                    {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Aperçu pièce jointe en préparation */}
        {attachment && (
          <View style={styles.attachPreview}>
            <Ionicons
              name={attachment.mime.startsWith("image/") ? "image" : "document-text"}
              size={20}
              color={COLORS.primary}
            />
            <Text style={styles.attachPreviewName} numberOfLines={1}>{attachment.name}</Text>
            <TouchableOpacity onPress={() => setAttachment(null)}>
              <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Modèles rapides pros */}
        {isPro && showTemplates && (
          <View style={styles.templatesBar}>
            <Text style={styles.templatesTitle}>Modèles rapides</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
              {PRO_TEMPLATES.map((t) => (
                <TouchableOpacity key={t.id} style={styles.templateChip} onPress={() => insertTemplate(t)}>
                  <Ionicons name={t.icon as any} size={14} color={COLORS.primary} />
                  <Text style={styles.templateChipText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Menu pièce jointe */}
        {showAttachMenu && (
          <View style={styles.attachMenu}>
            <TouchableOpacity style={styles.attachMenuItem} onPress={() => pickImage(true)}>
              <Ionicons name="camera" size={22} color={COLORS.primary} />
              <Text style={styles.attachMenuText}>Caméra</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachMenuItem} onPress={() => pickImage(false)}>
              <Ionicons name="image" size={22} color={COLORS.primary} />
              <Text style={styles.attachMenuText}>Galerie</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachMenuItem} onPress={pickDocument}>
              <Ionicons name="document-text" size={22} color={COLORS.primary} />
              <Text style={styles.attachMenuText}>Document</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputBar}>
          {/* Bouton templates (pro only) */}
          {isPro && (
            <TouchableOpacity
              style={[styles.iconBtn, showTemplates && styles.iconBtnActive]}
              onPress={() => { setShowTemplates(!showTemplates); setShowAttachMenu(false); }}
              testID="chat-templates-btn"
            >
              <Ionicons name="flash" size={20} color={showTemplates ? "#fff" : COLORS.primary} />
            </TouchableOpacity>
          )}
          {/* Bouton pièce jointe */}
          <TouchableOpacity
            style={[styles.iconBtn, showAttachMenu && styles.iconBtnActive]}
            onPress={() => { setShowAttachMenu(!showAttachMenu); setShowTemplates(false); }}
            testID="chat-attach-btn"
          >
            <Ionicons name="attach" size={20} color={showAttachMenu ? "#fff" : COLORS.primary} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Écrivez un message..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            testID="chat-input"
          />
          <TouchableOpacity
            style={[styles.sendBtn, ((!text.trim() && !attachment) || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={(!text.trim() && !attachment) || sending}
            testID="chat-send-btn"
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={20} color="#fff" />}
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
  hStatus: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  body: { padding: SPACING.lg, gap: 6 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 20, fontStyle: "italic" },
  bubble: { maxWidth: "80%", padding: 10, borderRadius: 16, gap: 4 },
  mine: { alignSelf: "flex-end", backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: COLORS.secondaryLight, borderBottomLeftRadius: 4 },
  mineText: { color: "#fff", fontSize: 14, lineHeight: 19 },
  theirsText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 19 },
  time: { fontSize: 9, marginTop: 4, opacity: 0.6, color: COLORS.textSecondary, alignSelf: "flex-end" },

  attachImage: { width: 200, height: 150, borderRadius: 10, backgroundColor: "#000" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 8, maxWidth: 240 },
  fileName: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.textPrimary },

  attachPreview: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#EFF6FF", borderTopWidth: 1, borderTopColor: COLORS.border },
  attachPreviewName: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.textPrimary },

  templatesBar: { paddingVertical: 10, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  templatesTitle: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, paddingHorizontal: 14, marginBottom: 6, textTransform: "uppercase" },
  templateChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primary },
  templateChipText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  attachMenu: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 14, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  attachMenuItem: { alignItems: "center", gap: 6, paddingHorizontal: 12 },
  attachMenuText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },

  inputBar: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "flex-end" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  iconBtnActive: { backgroundColor: COLORS.primary },
  input: { flex: 1, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.textPrimary, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
});
