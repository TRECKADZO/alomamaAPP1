/**
 * Documents médicaux d'un enfant (PDF, échographies, ordonnances...)
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { api, formatError } from "../../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../../constants/theme";

const TYPES = [
  { id: "ordonnance", label: "Ordonnance", icon: "📄", color: "#3B82F6" },
  { id: "analyse", label: "Analyse / Bilan", icon: "🧪", color: "#10B981" },
  { id: "echo", label: "Échographie", icon: "🩻", color: "#A855F7" },
  { id: "vaccin", label: "Vaccins", icon: "💉", color: "#F472B6" },
  { id: "autre", label: "Autre", icon: "📁", color: "#6B7280" },
];

export default function DocumentsEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [modal, setModal] = useState(false);
  const [pickedFile, setPickedFile] = useState<{ name: string; base64: string } | null>(null);
  const [form, setForm] = useState({ nom: "", type: "autre", description: "" });

  const load = async () => {
    if (!id) return;
    try {
      const r = await api.get(`/enfants/${id}/documents`);
      setDocs(r.data || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const pickPdf = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      // Lecture en base64 (web vs natif)
      let b64 = "";
      try {
        if (Platform.OS === "web") {
          const fr = await fetch(asset.uri);
          const blob = await fr.blob();
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        }
      } catch (readErr) {
        return Alert.alert("Erreur de lecture", "Impossible de lire le fichier sélectionné. Réessayez.");
      }
      // Limite 9 MB (taille des octets réels ≈ 3/4 de la longueur base64)
      const sizeBytes = asset.size || Math.round((b64.length * 3) / 4);
      if (sizeBytes > 9 * 1024 * 1024) {
        return Alert.alert("Fichier trop volumineux", "La taille maximale est de 9 Mo. Compressez ou choisissez un autre fichier.");
      }
      const mime = asset.mimeType || (asset.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      const dataUri = `data:${mime};base64,${b64}`;
      setPickedFile({ name: asset.name || "document", base64: dataUri });
      setForm({ ...form, nom: (asset.name || "document").replace(/\.[^.]+$/, "") });
      setModal(true);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const launchCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("Permission refusée", "Activez l'accès à la caméra dans les paramètres de votre téléphone.");
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
      if (r.canceled || !r.assets?.[0]?.base64) return;
      const dataUri = `data:image/jpeg;base64,${r.assets[0].base64}`;
      setPickedFile({ name: `photo_${Date.now()}.jpg`, base64: dataUri });
      setForm({ ...form, nom: "Photo " + new Date().toLocaleDateString("fr-FR") });
      setModal(true);
    } catch (e) {
      console.warn("Camera error", e);
      Alert.alert("Erreur appareil photo", formatError(e));
    }
  };

  const launchGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert("Permission refusée", "Activez l'accès aux photos dans les paramètres.");
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
      if (r.canceled || !r.assets?.[0]?.base64) return;
      const dataUri = `data:image/jpeg;base64,${r.assets[0].base64}`;
      setPickedFile({ name: `photo_${Date.now()}.jpg`, base64: dataUri });
      setForm({ ...form, nom: "Photo " + new Date().toLocaleDateString("fr-FR") });
      setModal(true);
    } catch (e) {
      console.warn("Gallery error", e);
      Alert.alert("Erreur galerie", formatError(e));
    }
  };

  const pickPhoto = () => {
    Alert.alert(
      "Ajouter une photo",
      "Choisissez la source",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Appareil photo", onPress: launchCamera },
        { text: "Galerie", onPress: launchGallery },
      ],
      { cancelable: true },
    );
  };

  const upload = async () => {
    if (!pickedFile || !form.nom.trim()) return Alert.alert("Champ requis", "Nom du document obligatoire");
    setUploading(true);
    try {
      await api.post(`/enfants/${id}/documents`, {
        nom: form.nom.trim(),
        type: form.type,
        description: form.description.trim() || undefined,
        file_base64: pickedFile.base64,
      });
      setPickedFile(null); setForm({ nom: "", type: "autre", description: "" }); setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); } finally { setUploading(false); }
  };

  const supprimer = (docId: string) => {
    Alert.alert("Supprimer ce document ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => { try { await api.delete(`/enfants/${id}/documents/${docId}`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); } } },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📄 Documents</Text>
          <Text style={styles.sub}>{docs.length} document{docs.length > 1 ? "s" : ""}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickPdf}>
            <Ionicons name="document-attach" size={20} color="#fff" />
            <Text style={styles.uploadText}>Fichier (PDF/Image)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: "#EC4899" }]} onPress={pickPhoto}>
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.uploadText}>Photo</Text>
          </TouchableOpacity>
        </View>

        {docs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun document</Text>
            <Text style={styles.emptyText}>Téléchargez ordonnances, échographies, analyses ou autres documents médicaux.</Text>
          </View>
        ) : docs.map((d) => {
          const t = TYPES.find((x) => x.id === d.type) || TYPES[TYPES.length - 1];
          return (
            <TouchableOpacity
              key={d.id}
              onPress={() => router.push(`/enfants/${id}/document-view/${d.id}`)}
              activeOpacity={0.7}
              style={[styles.card, { borderLeftColor: t.color, borderLeftWidth: 4 }]}
            >
              <View style={[styles.docIcon, { backgroundColor: t.color + "20" }]}>
                <Text style={{ fontSize: 24 }}>{t.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.docName} numberOfLines={1}>{d.nom}</Text>
                <Text style={styles.docMeta}>{t.label} · {d.size_kb} ko · {d.created_at ? new Date(d.created_at).toLocaleDateString("fr-FR") : ""}</Text>
                {d.description && <Text style={styles.docMeta}>{d.description}</Text>}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); supprimer(d.id); }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Détails du document</Text>
              <TouchableOpacity onPress={() => { setModal(false); setPickedFile(null); }}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>

            {pickedFile && <Text style={styles.fileName}>📎 {pickedFile.name}</Text>}

            <Text style={styles.label}>Nom *</Text>
            <TextInput style={styles.input} value={form.nom} onChangeText={(v) => setForm({ ...form, nom: v })} placeholder="Ex: Echo 32 SA" placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typesRow}>
              {TYPES.map((t) => (
                <TouchableOpacity key={t.id} onPress={() => setForm({ ...form, type: t.id })} style={[styles.typeChip, form.type === t.id && { backgroundColor: t.color, borderColor: t.color }]}>
                  <Text style={{ fontSize: 14 }}>{t.icon}</Text>
                  <Text style={[styles.typeText, form.type === t.id && { color: "#fff" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Description (facultatif)</Text>
            <TextInput style={[styles.input, { height: 60 }]} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Notes additionnelles" placeholderTextColor={COLORS.textMuted} multiline />

            <TouchableOpacity onPress={upload} disabled={uploading} style={{ marginTop: 14 }}>
              <LinearGradient colors={["#3B82F6", "#06B6D4"]} style={styles.saveBtn}>
                {uploading ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="cloud-upload" size={20} color="#fff" /><Text style={styles.saveText}>Enregistrer</Text></>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  uploadBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, backgroundColor: "#3B82F6", borderRadius: 999 },
  uploadText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: 30, marginTop: 6, lineHeight: 17 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  docIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  docMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary },
  fileName: { fontSize: 12, color: COLORS.primary, padding: 10, backgroundColor: COLORS.primaryLight, borderRadius: 8, fontStyle: "italic" },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, marginTop: 12, marginBottom: 6, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary },
  typesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgPrimary },
  typeText: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
