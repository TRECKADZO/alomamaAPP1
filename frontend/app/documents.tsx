/**
 * Mes Documents — synchronisé avec le backend (cloud), supporte PDF + images.
 * - Upload via DocumentPicker (PDF) ou ImagePicker (photos)
 * - Stocké sur le backend en base64 (associé à user_id, sécurisé GDPR)
 * - Visionneuse : tap sur un document → ouvre `/documents/{id}` (page dédiée)
 */
import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform, Alert, Image, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import { pickImageBase64 } from "../lib/imagePicker";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import DateField from "../components/DateField";

const CATS = [
  { id: "echographie", label: "Échographie", icon: "scan", color: "#06B6D4" },
  { id: "analyse", label: "Analyse", icon: "flask", color: "#10B981" },
  { id: "ordonnance", label: "Ordonnance", icon: "document-text", color: "#F59E0B" },
  { id: "vaccin", label: "Vaccin", icon: "medical", color: "#EC4899" },
  { id: "naissance", label: "Naissance", icon: "happy", color: "#A855F7" },
  { id: "autre", label: "Autre", icon: "folder", color: "#6B7280" },
];

const formatSize = (bytes?: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

interface DocItem {
  id: string;
  titre: string;
  categorie: string;
  date: string;
  notes?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  created_at: string;
}

export default function MesDocuments() {
  const router = useRouter();
  const [list, setList] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState("toutes");
  const [saving, setSaving] = useState(false);

  // Form state
  const [titre, setTitre] = useState("");
  const [categorie, setCategorie] = useState("echographie");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [fileBase64, setFileBase64] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("");

  const resetForm = () => {
    setTitre(""); setCategorie("echographie");
    setDate(new Date().toISOString().slice(0, 10));
    setNotes(""); setFileBase64(""); setFileName(""); setMimeType("");
  };

  const load = async () => {
    try {
      const r = await api.get("/documents");
      setList(r.data || []);
    } catch (e: any) {
      console.warn("Load documents failed", e?.message);
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  // ----- Picker hybride : PDF, image, ou tout autre fichier -----
  const pickPdfOrFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      // Conversion en base64
      let b64 = "";
      try {
        if (Platform.OS === "web") {
          // Sur web, on peut fetch l'URI
          const fr = await fetch(asset.uri);
          const blob = await fr.blob();
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          // Natif : lire en base64 via FileSystem
          const FileSystem = require("expo-file-system");
          b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        }
      } catch (e: any) {
        Alert.alert("Erreur de lecture", "Impossible de lire le fichier sélectionné.");
        return;
      }
      // Validation taille (max ~9 Mo)
      const sizeBytes = asset.size || (b64.length * 3 / 4);
      if (sizeBytes > 9 * 1024 * 1024) {
        Alert.alert("Fichier trop volumineux", "La taille maximale est de 9 Mo. Compressez-le ou choisissez un autre fichier.");
        return;
      }
      setFileBase64(b64);
      setFileName(asset.name || "document");
      setMimeType(asset.mimeType || (asset.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"));
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const pickFromGallery = async () => {
    const b64 = await pickImageBase64();
    if (b64) {
      setFileBase64(b64);
      setFileName(`photo_${Date.now()}.jpg`);
      setMimeType("image/jpeg");
    }
  };

  const save = async () => {
    if (!titre.trim()) return Alert.alert("Titre requis", "Veuillez saisir un titre pour ce document.");
    if (!fileBase64) return Alert.alert("Fichier manquant", "Veuillez ajouter un fichier (PDF, photo, etc.)");
    setSaving(true);
    try {
      await api.post("/documents", {
        titre: titre.trim(),
        categorie,
        date,
        notes: notes.trim(),
        file_base64: fileBase64,
        file_name: fileName,
        mime_type: mimeType,
      });
      setModal(false);
      resetForm();
      await load();
      Alert.alert("✅ Document enregistré", "Votre document a été ajouté avec succès.");
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally { setSaving(false); }
  };

  const remove = (id: string) => {
    Alert.alert(
      "Supprimer ce document ?",
      "Cette action est définitive.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: async () => {
          try {
            await api.delete(`/documents/${id}`);
            setList((prev) => prev.filter((d) => d.id !== id));
          } catch (e: any) { Alert.alert("Erreur", formatError(e)); }
        } },
      ]
    );
  };

  const filtered = filter === "toutes" ? list : list.filter((d) => d.categorie === filter);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes documents</Text>
          <Text style={styles.sub}>PDF, photos, ordonnances</Text>
        </View>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filtres catégories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
        <TouchableOpacity onPress={() => setFilter("toutes")} style={[styles.catChip, filter === "toutes" && styles.catChipActive]}>
          <Text style={[styles.catChipText, filter === "toutes" && { color: "#fff" }]}>Toutes ({list.length})</Text>
        </TouchableOpacity>
        {CATS.map((c) => {
          const count = list.filter((d) => d.categorie === c.id).length;
          return (
            <TouchableOpacity key={c.id} onPress={() => setFilter(c.id)} style={[styles.catChip, filter === c.id && { backgroundColor: c.color, borderColor: c.color }]}>
              <Text style={[styles.catChipText, filter === c.id && { color: "#fff" }]}>{c.label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun document</Text>
            <Text style={styles.emptyText}>Ajoutez vos premiers documents (PDF ou photos) pour les retrouver depuis n'importe quel téléphone.</Text>
            <TouchableOpacity onPress={() => setModal(true)} style={styles.emptyBtn}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>Ajouter un document</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filtered.map((d) => {
            const cat = CATS.find((c) => c.id === d.categorie) || CATS[CATS.length - 1];
            const isPdf = (d.mime_type || "").includes("pdf");
            const isImage = (d.mime_type || "").startsWith("image");
            return (
              <TouchableOpacity
                key={d.id}
                style={styles.card}
                onPress={() => router.push(`/documents/${d.id}` as any)}
                onLongPress={() => remove(d.id)}
                activeOpacity={0.7}
              >
                <LinearGradient colors={[cat.color, cat.color + "AA"]} style={styles.cardIcon}>
                  <Ionicons name={isPdf ? "document" : isImage ? "image" : (cat.icon as any)} size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{d.titre}</Text>
                  <Text style={styles.cardSub}>
                    {cat.label} · {new Date(d.date).toLocaleDateString("fr-FR")} · {formatSize(d.size_bytes)}
                  </Text>
                  {d.notes ? <Text style={styles.cardNotes} numberOfLines={1}>{d.notes}</Text> : null}
                  <View style={styles.fileBadgeRow}>
                    <View style={[styles.fileBadge, { backgroundColor: isPdf ? "#FEE2E2" : isImage ? "#DBEAFE" : "#F3F4F6" }]}>
                      <Text style={[styles.fileBadgeText, { color: isPdf ? "#B91C1C" : isImage ? "#1E40AF" : "#374151" }]}>
                        {isPdf ? "📄 PDF" : isImage ? "🖼️ IMAGE" : "📎 FICHIER"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouveau document</Text>
                <TouchableOpacity onPress={() => { setModal(false); resetForm(); }}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Catégorie</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {CATS.map((c) => (
                  <TouchableOpacity key={c.id} onPress={() => setCategorie(c.id)} style={[styles.catChip, categorie === c.id && { backgroundColor: c.color, borderColor: c.color }]}>
                    <Text style={[styles.catChipText, categorie === c.id && { color: "#fff" }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Titre *</Text>
              <TextInput
                style={styles.input}
                value={titre}
                onChangeText={setTitre}
                placeholder="Échographie 22 SA, Bilan sanguin, etc."
                placeholderTextColor={COLORS.textMuted}
                maxLength={200}
              />

              <Text style={styles.label}>Date du document</Text>
              <DateField value={date} onChange={setDate} placeholder="Choisir la date" />

              <Text style={styles.label}>Notes (optionnel)</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: "top" }]}
                multiline
                value={notes}
                onChangeText={setNotes}
                placeholder="Précisions, médecin prescripteur..."
                placeholderTextColor={COLORS.textMuted}
                maxLength={1000}
              />

              <Text style={styles.label}>Fichier *</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={pickPdfOrFile} style={[styles.fileBtn, { flex: 1 }]}>
                  <Ionicons name="document-attach" size={18} color={COLORS.primary} />
                  <Text style={styles.fileBtnText}>PDF / Fichier</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickFromGallery} style={[styles.fileBtn, { flex: 1 }]}>
                  <Ionicons name="camera" size={18} color={COLORS.primary} />
                  <Text style={styles.fileBtnText}>Photo</Text>
                </TouchableOpacity>
              </View>

              {fileBase64 ? (
                <View style={styles.fileSelected}>
                  <Ionicons name={mimeType.includes("pdf") ? "document" : mimeType.includes("image") ? "image" : "attach"} size={22} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileSelectedName} numberOfLines={1}>{fileName || "Fichier sélectionné"}</Text>
                    <Text style={styles.fileSelectedSize}>{formatSize(Math.round(fileBase64.length * 3 / 4))} · {mimeType}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setFileBase64(""); setFileName(""); setMimeType(""); }}>
                    <Ionicons name="close-circle" size={22} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity onPress={save} disabled={saving || !titre || !fileBase64}>
                <LinearGradient
                  colors={(saving || !titre || !fileBase64) ? ["#94A3B8", "#94A3B8"] : ["#14B8A6", "#06B6D4"]}
                  style={styles.btnPrimary}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.btnPrimaryText}>Enregistrer</Text>
                  )}
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#14B8A6", alignItems: "center", justifyContent: "center" },

  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },

  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4, textAlign: "center", fontSize: 12 },
  emptyBtn: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, marginTop: 16 },
  emptyBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  cardSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  cardNotes: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  fileBadgeRow: { flexDirection: "row", marginTop: 6 },
  fileBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  fileBadgeText: { fontSize: 10, fontWeight: "800" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },

  fileBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  fileBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  fileSelected: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: "#D1FAE5", borderRadius: RADIUS.md, marginTop: 10, borderWidth: 1, borderColor: "#10B981" },
  fileSelectedName: { color: "#065F46", fontWeight: "800", fontSize: 13 },
  fileSelectedSize: { color: "#047857", fontSize: 11, marginTop: 2 },

  btnPrimary: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
