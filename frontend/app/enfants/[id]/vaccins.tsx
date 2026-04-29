/**
 * Carnet vaccinal d'un enfant
 * Liste des vaccins faits + ajout/suppression
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";
import DateField from "../../../components/DateField";

// Calendrier vaccinal EPI Côte d'Ivoire (simplifié)
const VACCINS_EPI = [
  { nom: "BCG", age: "Naissance", description: "Tuberculose", color: "#06B6D4" },
  { nom: "VPO 0", age: "Naissance", description: "Poliomyélite", color: "#06B6D4" },
  { nom: "Hépatite B 0", age: "Naissance", description: "Hépatite B", color: "#06B6D4" },
  { nom: "Penta 1", age: "6 semaines", description: "DTC + Hib + HepB", color: "#3B82F6" },
  { nom: "VPO 1 / VPI", age: "6 semaines", description: "Polio", color: "#3B82F6" },
  { nom: "PCV 1", age: "6 semaines", description: "Pneumocoque", color: "#3B82F6" },
  { nom: "Rota 1", age: "6 semaines", description: "Rotavirus", color: "#3B82F6" },
  { nom: "Penta 2", age: "10 semaines", description: "DTC + Hib + HepB", color: "#8B5CF6" },
  { nom: "VPO 2", age: "10 semaines", description: "Polio", color: "#8B5CF6" },
  { nom: "PCV 2", age: "10 semaines", description: "Pneumocoque", color: "#8B5CF6" },
  { nom: "Rota 2", age: "10 semaines", description: "Rotavirus", color: "#8B5CF6" },
  { nom: "Penta 3", age: "14 semaines", description: "DTC + Hib + HepB", color: "#A855F7" },
  { nom: "VPO 3", age: "14 semaines", description: "Polio", color: "#A855F7" },
  { nom: "PCV 3", age: "14 semaines", description: "Pneumocoque", color: "#A855F7" },
  { nom: "Rougeole 1 / VAR", age: "9 mois", description: "Rougeole + Fièvre jaune", color: "#F472B6" },
  { nom: "Rougeole 2", age: "15-18 mois", description: "Rappel rougeole", color: "#EC4899" },
  { nom: "DTC Rappel", age: "4-6 ans", description: "Rappel diphtérie/tétanos/coqueluche", color: "#10B981" },
];

export default function VaccinsEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [enfant, setEnfant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nom: "", date: "", lieu: "", lot: "" });

  const load = async () => {
    if (!id) return;
    try {
      const r = await api.get("/enfants");
      setEnfant((r.data || []).find((x: any) => x.id === id));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const ajouter = async () => {
    if (!form.nom.trim() || !form.date) return Alert.alert("Champs requis", "Nom et date sont obligatoires");
    try {
      await api.post(`/enfants/${id}/vaccins`, { nom: form.nom.trim(), date: form.date, lieu: form.lieu.trim() || undefined, lot: form.lot.trim() || undefined });
      setForm({ nom: "", date: "", lieu: "", lot: "" });
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const supprimer = (vid: string) => {
    Alert.alert("Supprimer ce vaccin ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => { try { await api.delete(`/enfants/${id}/vaccins/${vid}`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); } } },
    ]);
  };

  const ajouterRapide = (nom: string) => {
    setForm({ nom, date: new Date().toISOString().split("T")[0], lieu: "", lot: "" });
    setModal(true);
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!enfant) return <SafeAreaView style={styles.loading}><Text>Enfant introuvable</Text></SafeAreaView>;

  const vaccinsFaits = enfant.vaccins || [];
  const noms_faits = new Set(vaccinsFaits.map((v: any) => v.nom));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>💉 Vaccins</Text>
          <Text style={styles.sub}>{enfant.nom} · {vaccinsFaits.length} vaccin{vaccinsFaits.length > 1 ? "s" : ""} reçu{vaccinsFaits.length > 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {vaccinsFaits.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>✅ Vaccins reçus</Text>
            {vaccinsFaits.map((v: any) => (
              <View key={v.id} style={[styles.card, { borderLeftColor: "#10B981", borderLeftWidth: 4 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{v.nom}</Text>
                  <Text style={styles.cardMeta}>📅 {v.date ? new Date(v.date).toLocaleDateString("fr-FR") : ""}{v.lieu ? ` · 📍 ${v.lieu}` : ""}{v.lot ? ` · Lot: ${v.lot}` : ""}</Text>
                </View>
                <TouchableOpacity onPress={() => supprimer(v.id)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>📋 Calendrier EPI Côte d'Ivoire</Text>
        <Text style={styles.helpText}>Programme Élargi de Vaccination — touchez pour ajouter rapidement</Text>
        {VACCINS_EPI.map((v) => {
          const fait = noms_faits.has(v.nom);
          return (
            <TouchableOpacity
              key={v.nom}
              disabled={fait}
              onPress={() => ajouterRapide(v.nom)}
              style={[styles.card, { borderLeftColor: v.color, borderLeftWidth: 4, opacity: fait ? 0.5 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{v.nom} {fait ? "✅" : ""}</Text>
                <Text style={styles.cardMeta}>⏱ {v.age} · {v.description}</Text>
              </View>
              {!fait && <Ionicons name="add-circle-outline" size={22} color={v.color} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau vaccin</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Nom du vaccin *</Text>
            <TextInput style={styles.input} value={form.nom} onChangeText={(v) => setForm({ ...form, nom: v })} placeholder="Ex: BCG" placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.label}>Date *</Text>
            <DateField value={form.date} mode="date" onChange={(v) => setForm({ ...form, date: v })} maximumDate={new Date()} />
            <Text style={styles.label}>Lieu (facultatif)</Text>
            <TextInput style={styles.input} value={form.lieu} onChangeText={(v) => setForm({ ...form, lieu: v })} placeholder="Ex: PMI Cocody" placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.label}>Lot (facultatif)</Text>
            <TextInput style={styles.input} value={form.lot} onChangeText={(v) => setForm({ ...form, lot: v })} placeholder="Numéro de lot" placeholderTextColor={COLORS.textMuted} />
            <TouchableOpacity onPress={ajouter} style={{ marginTop: 16 }}>
              <LinearGradient colors={["#10B981", "#22C55E"]} style={styles.saveBtn}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveText}>Enregistrer</Text>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 8 },
  helpText: { fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginBottom: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  cardMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
