import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickImageBase64 } from "../lib/imagePicker";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const KEY = "documents_v1";
const CATS = [
  { id: "echographie", label: "Échographie", icon: "scan", color: "#06B6D4" },
  { id: "analyse", label: "Analyse", icon: "flask", color: "#10B981" },
  { id: "ordonnance", label: "Ordonnance", icon: "document-text", color: "#F59E0B" },
  { id: "vaccin", label: "Vaccin", icon: "medical", color: "#EC4899" },
  { id: "naissance", label: "Naissance", icon: "happy", color: "#A855F7" },
  { id: "autre", label: "Autre", icon: "folder", color: "#6B7280" },
];

export default function MesDocuments() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ titre: "", categorie: "echographie", date: new Date().toISOString().slice(0, 10), notes: "", image_base64: "" });
  const [filter, setFilter] = useState("toutes");

  const load = async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      setList(raw ? JSON.parse(raw) : []);
    } catch { setList([]); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const pickPhoto = async () => {
    const b64 = await pickImageBase64();
    if (b64) setForm({ ...form, image_base64: b64 });
  };

  const save = async () => {
    if (!form.titre) return Alert.alert("Titre requis");
    const next = [{ id: Date.now().toString(), ...form, created_at: new Date().toISOString() }, ...list];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    setList(next);
    setModal(false);
    setForm({ titre: "", categorie: "echographie", date: new Date().toISOString().slice(0, 10), notes: "", image_base64: "" });
  };

  const remove = (id: string) => {
    Alert.alert("Supprimer ?", "", [
      { text: "Annuler" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        const next = list.filter((d) => d.id !== id);
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
        setList(next);
      } },
    ]);
  };

  const filtered = filter === "toutes" ? list : list.filter((d) => d.categorie === filter);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes documents</Text>
          <Text style={styles.sub}>Carnets, analyses, ordonnances</Text>
        </View>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
      </View>

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

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun document</Text>
            <Text style={styles.emptyText}>Ajoutez vos premiers documents médicaux pour les retrouver facilement.</Text>
          </View>
        ) : (
          filtered.map((d) => {
            const cat = CATS.find((c) => c.id === d.categorie) || CATS[CATS.length - 1];
            return (
              <View key={d.id} style={styles.card}>
                <LinearGradient colors={[cat.color, cat.color + "AA"]} style={styles.cardIcon}>
                  <Ionicons name={cat.icon as any} size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{d.titre}</Text>
                  <Text style={styles.cardSub}>{cat.label} · {new Date(d.date).toLocaleDateString("fr-FR")}</Text>
                  {d.notes ? <Text style={styles.cardNotes} numberOfLines={2}>{d.notes}</Text> : null}
                  {d.image_base64 ? (
                    <Image source={{ uri: `data:image/jpeg;base64,${d.image_base64}` }} style={styles.thumb} />
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => remove(d.id)}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouveau document</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Catégorie</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {CATS.map((c) => (
                  <TouchableOpacity key={c.id} onPress={() => setForm({ ...form, categorie: c.id })} style={[styles.catChip, form.categorie === c.id && { backgroundColor: c.color, borderColor: c.color }]}>
                    <Text style={[styles.catChipText, form.categorie === c.id && { color: "#fff" }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Titre *</Text>
              <TextInput style={styles.input} value={form.titre} onChangeText={(v) => setForm({ ...form, titre: v })} placeholder="Échographie 22 SA..." placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.label}>Date</Text>
              <TextInput style={styles.input} value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />
              <Text style={styles.label}>Photo (optionnelle)</Text>
              <TouchableOpacity onPress={pickPhoto} style={styles.photoBtn}>
                <Ionicons name="camera" size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontWeight: "700" }}>{form.image_base64 ? "Photo ajoutée ✓" : "Ajouter une photo"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save}>
                <LinearGradient colors={["#14B8A6", "#06B6D4"]} style={styles.btnPrimary}>
                  <Text style={styles.btnPrimaryText}>Enregistrer</Text>
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
  emptyText: { color: COLORS.textSecondary, marginTop: 4, textAlign: "center" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  cardSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  cardNotes: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  thumb: { width: 60, height: 60, borderRadius: 8, marginTop: 6 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  photoBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.primary },
  btnPrimary: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 18 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
