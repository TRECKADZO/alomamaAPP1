import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const MOODS = [
  { id: "heureuse", emoji: "😊", label: "Heureuse" },
  { id: "sereine", emoji: "😌", label: "Sereine" },
  { id: "emotive", emoji: "💗", label: "Émotive" },
  { id: "fatiguee", emoji: "😪", label: "Fatiguée" },
  { id: "anxieuse", emoji: "😕", label: "Anxieuse" },
];

export default function JournalScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  // form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"note" | "echographie" | "souvenir" | "ressenti">("note");
  const [mood, setMood] = useState<string>("");
  const [photo, setPhoto] = useState<string>("");

  const load = async () => {
    try { const r = await api.get("/grossesse-plus/journal"); setItems(r.data || []); } catch {} finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission refusée", "L'accès aux photos est nécessaire.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.6, allowsEditing: true });
    if (!r.canceled && r.assets[0]?.base64) setPhoto(`data:image/jpeg;base64,${r.assets[0].base64}`);
  };

  const submit = async () => {
    if (!content.trim()) return Alert.alert("Contenu requis", "Veuillez écrire au moins quelques mots.");
    try {
      setBusy(true);
      await api.post("/grossesse-plus/journal", { title: title || undefined, content, type, mood: mood || undefined, photo_base64: photo || undefined });
      setTitle(""); setContent(""); setMood(""); setPhoto(""); setType("note"); setModal(false);
      await load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    Alert.alert("Supprimer cette entrée ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => { try { await api.delete(`/grossesse-plus/journal/${id}`); load(); } catch {} } },
    ]);
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
        {items.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 50 }}>📖</Text>
            <Text style={s.emptyTitle}>Votre journal est vide</Text>
            <Text style={s.emptyTxt}>Notez vos ressentis, gardez les photos d'échographies, et conservez les souvenirs de cette aventure unique.</Text>
          </View>
        ) : items.map(it => (
          <View key={it.id} style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardType}>{it.type === "echographie" ? "👶 Échographie" : it.type === "souvenir" ? "✨ Souvenir" : it.type === "ressenti" ? "💗 Ressenti" : "📝 Note"}</Text>
              <Text style={s.cardDate}>SA {it.week} • {new Date(it.created_at).toLocaleDateString("fr-FR")}</Text>
            </View>
            {it.title ? <Text style={s.cardTitle}>{it.title}</Text> : null}
            {it.photo_base64 ? <Image source={{ uri: it.photo_base64 }} style={s.photo} /> : null}
            <Text style={s.cardContent}>{it.content}</Text>
            {it.mood && <Text style={s.cardMood}>{MOODS.find(m => m.id === it.mood)?.emoji} {MOODS.find(m => m.id === it.mood)?.label}</Text>}
            <TouchableOpacity onPress={() => remove(it.id)} style={s.delBtn}>
              <Ionicons name="trash" size={14} color="#DC2626" />
              <Text style={s.delTxt}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => setModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalWrap}>
          <ScrollView style={s.modal} contentContainerStyle={{ padding: SPACING.lg }}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Nouvelle entrée</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={26} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={s.label}>Type</Text>
            <View style={s.row}>
              {(["note", "echographie", "souvenir", "ressenti"] as const).map(t => (
                <TouchableOpacity key={t} style={[s.typeBtn, type === t && s.typeOn]} onPress={() => setType(t)}>
                  <Text style={[s.typeTxt, type === t && s.typeTxtOn]}>{t === "echographie" ? "Écho" : t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Titre (optionnel)</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Ex: Premier coup de pied" placeholderTextColor={COLORS.textMuted} />
            <Text style={s.label}>Contenu *</Text>
            <TextInput style={[s.input, { height: 120 }]} value={content} onChangeText={setContent} multiline placeholder="Écrivez ce que vous ressentez..." placeholderTextColor={COLORS.textMuted} />
            <Text style={s.label}>Humeur</Text>
            <View style={s.row}>
              {MOODS.map(m => (
                <TouchableOpacity key={m.id} style={[s.moodBtn, mood === m.id && s.moodOn]} onPress={() => setMood(mood === m.id ? "" : m.id)}>
                  <Text style={{ fontSize: 24 }}>{m.emoji}</Text>
                  <Text style={[s.moodTxt, mood === m.id && s.moodTxtOn]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {photo ? (
              <View style={{ marginTop: 12 }}>
                <Image source={{ uri: photo }} style={s.preview} />
                <TouchableOpacity onPress={() => setPhoto("")} style={s.removePhoto}>
                  <Text style={{ color: "#DC2626", fontWeight: "700" }}>Retirer la photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
                <Ionicons name="image" size={18} color={COLORS.primary} />
                <Text style={s.photoBtnTxt}>Ajouter une photo (échographie...)</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
              <Text style={s.btnTxt}>{busy ? "Enregistrement..." : "Enregistrer"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  empty: { alignItems: "center", padding: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 6 },
  emptyTxt: { color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
  card: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardType: { fontWeight: "800", color: COLORS.primary, fontSize: 13 },
  cardDate: { color: COLORS.textMuted, fontSize: 12 },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15, marginBottom: 6 },
  cardContent: { color: COLORS.textPrimary, lineHeight: 20 },
  cardMood: { color: COLORS.textSecondary, marginTop: 8, fontWeight: "700" },
  photo: { width: "100%", height: 200, borderRadius: RADIUS.md, marginBottom: 10 },
  delBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", marginTop: 8 },
  delTxt: { color: "#DC2626", fontSize: 12, fontWeight: "700" },
  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", elevation: 6 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  row: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  typeBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  typeOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeTxt: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700" },
  typeTxtOn: { color: "#fff" },
  moodBtn: { padding: 8, alignItems: "center", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, width: "18%" },
  moodOn: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  moodTxt: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  moodTxtOn: { color: COLORS.primary, fontWeight: "700" },
  photoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, borderStyle: "dashed", marginTop: 12 },
  photoBtnTxt: { color: COLORS.primary, fontWeight: "700" },
  preview: { width: "100%", height: 200, borderRadius: RADIUS.md },
  removePhoto: { padding: 8, alignItems: "center" },
  btn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 24 },
  btnTxt: { color: "#fff", fontWeight: "800" },
});
