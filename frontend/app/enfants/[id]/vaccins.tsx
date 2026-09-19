/**
 * Carnet vaccinal d'un enfant — 💚 avec distinction visuelle claire des vaccins FAITS
 *
 * Design :
 * - Vaccins FAITS : fond vert clair + border vert + coche verte + date + badge "Fait"
 * - Vaccins À FAIRE : fond blanc + border colorée gauche + bouton "+" pour ajouter
 * - Progression globale en haut (compteur X/17 EPI faits)
 * - Édition possible d'un vaccin fait (tap sur la carte verte)
 */
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert,
} from "react-native";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", date: "", lieu: "", lot: "" });

  const load = async () => {
    if (!id) return;
    try {
      const r = await api.get("/enfants");
      setEnfant((r.data || []).find((x: any) => x.id === id));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const saveVaccin = async () => {
    if (!form.nom.trim() || !form.date) return Alert.alert("Champs requis", "Nom et date sont obligatoires");
    try {
      if (editingId) {
        await api.patch(`/enfants/${id}/vaccins/${editingId}`, {
          nom: form.nom.trim(),
          date: form.date,
          lieu: form.lieu.trim() || "",
          lot: form.lot.trim() || "",
        });
      } else {
        await api.post(`/enfants/${id}/vaccins`, {
          nom: form.nom.trim(),
          date: form.date,
          lieu: form.lieu.trim() || undefined,
          lot: form.lot.trim() || undefined,
          fait: true,
        });
      }
      resetForm();
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const supprimer = (vid: string) => {
    Alert.alert("Supprimer ce vaccin ?", "Le vaccin sera retiré du carnet.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer", style: "destructive",
        onPress: async () => {
          try { await api.delete(`/enfants/${id}/vaccins/${vid}`); load(); }
          catch (e) { Alert.alert("Erreur", formatError(e)); }
        },
      },
    ]);
  };

  const openAdd = (nom: string = "") => {
    setEditingId(null);
    setForm({ nom, date: new Date().toISOString().split("T")[0], lieu: "", lot: "" });
    setModal(true);
  };

  const openEdit = (v: any) => {
    setEditingId(v.id);
    setForm({
      nom: v.nom || "",
      date: v.date ? v.date.split("T")[0] : new Date().toISOString().split("T")[0],
      lieu: v.lieu || "",
      lot: v.lot || "",
    });
    setModal(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ nom: "", date: "", lieu: "", lot: "" });
    setModal(false);
  };

  const vaccinsFaits = enfant?.vaccins || [];
  const noms_faits = useMemo(() => new Set(vaccinsFaits.map((v: any) => v.nom)), [vaccinsFaits]);
  const epi_count = VACCINS_EPI.filter((v) => noms_faits.has(v.nom)).length;
  const epi_total = VACCINS_EPI.length;
  const progress_pct = Math.round((epi_count / epi_total) * 100);

  // Vaccins "hors EPI" (ajoutés manuellement avec un nom qui n'est pas dans le calendrier officiel)
  const hors_epi = vaccinsFaits.filter((v: any) => !VACCINS_EPI.some((e) => e.nom === v.nom));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!enfant) return <SafeAreaView style={styles.loading}><Text>Enfant introuvable</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>💉 Carnet vaccinal</Text>
          <Text style={styles.sub}>{enfant.nom}</Text>
        </View>
        <TouchableOpacity onPress={() => openAdd()} style={styles.addBtn} testID="add-vaccin-btn">
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Progression EPI */}
        <LinearGradient colors={["#10B981", "#22C55E"]} style={styles.progressCard}>
          <View style={styles.progressTop}>
            <View style={styles.progressCircle}>
              <Text style={styles.progressPct}>{progress_pct}%</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressTitle}>Programme EPI</Text>
              <Text style={styles.progressSub}>
                {epi_count} sur {epi_total} vaccins reçus
              </Text>
              {epi_count < epi_total && (
                <Text style={styles.progressHint}>
                  {epi_total - epi_count} à faire pour compléter le calendrier
                </Text>
              )}
              {epi_count === epi_total && (
                <Text style={styles.progressHint}>🎉 Calendrier complet !</Text>
              )}
            </View>
          </View>
          <View style={styles.progressBarWrap}>
            <View style={[styles.progressBar, { width: `${progress_pct}%` }]} />
          </View>
        </LinearGradient>

        {/* Vaccins hors calendrier EPI */}
        {hors_epi.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>💚 Autres vaccins reçus ({hors_epi.length})</Text>
            {hors_epi.map((v: any) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.cardDone]}
                onPress={() => openEdit(v)}
                testID={`vaccin-done-${v.id}`}
              >
                <View style={styles.doneIcon}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.doneHeader}>
                    <Text style={styles.doneName}>{v.nom}</Text>
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>✓ Fait</Text>
                    </View>
                  </View>
                  <Text style={styles.doneMeta}>
                    📅 {v.date ? new Date(v.date).toLocaleDateString("fr-FR") : "—"}
                    {v.lieu ? ` · 📍 ${v.lieu}` : ""}
                    {v.lot ? ` · Lot: ${v.lot}` : ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => supprimer(v.id)} hitSlop={10} testID={`del-${v.id}`}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Calendrier EPI officiel */}
        <Text style={styles.sectionTitle}>📋 Calendrier EPI Côte d&apos;Ivoire</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
            <Text style={styles.legendText}>Fait</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
            <Text style={styles.legendText}>À faire</Text>
          </View>
        </View>

        {VACCINS_EPI.map((v) => {
          const done = vaccinsFaits.find((x: any) => x.nom === v.nom);
          const isDone = !!done;
          return (
            <TouchableOpacity
              key={v.nom}
              onPress={() => isDone ? openEdit(done) : openAdd(v.nom)}
              style={isDone ? styles.cardDone : styles.cardTodo}
              testID={`epi-${v.nom.replace(/\s+/g, '-')}`}
            >
              {isDone ? (
                <View style={styles.doneIcon}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
              ) : (
                <View style={[styles.todoIcon, { backgroundColor: v.color + "22", borderColor: v.color }]}>
                  <Ionicons name="calendar-outline" size={18} color={v.color} />
                </View>
              )}

              <View style={{ flex: 1 }}>
                <View style={styles.doneHeader}>
                  <Text style={isDone ? styles.doneName : styles.todoName}>{v.nom}</Text>
                  {isDone ? (
                    <View style={styles.doneBadge}>
                      <Text style={styles.doneBadgeText}>✓ Fait</Text>
                    </View>
                  ) : (
                    <View style={styles.todoBadge}>
                      <Text style={styles.todoBadgeText}>À faire</Text>
                    </View>
                  )}
                </View>
                {isDone ? (
                  <Text style={styles.doneMeta}>
                    📅 {done.date ? new Date(done.date).toLocaleDateString("fr-FR") : "—"}
                    {done.lieu ? ` · 📍 ${done.lieu}` : ""}
                    {done.lot ? ` · Lot: ${done.lot}` : ""}
                  </Text>
                ) : (
                  <Text style={styles.todoMeta}>⏱ {v.age} · {v.description}</Text>
                )}
              </View>

              {!isDone && <Ionicons name="add-circle" size={26} color={v.color} />}
            </TouchableOpacity>
          );
        })}

        {/* Bouton flottant "ajouter" en bas */}
        <TouchableOpacity onPress={() => openAdd()} style={{ marginTop: 20 }}>
          <LinearGradient colors={["#10B981", "#22C55E"]} style={styles.saveBtn}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.saveText}>Ajouter un autre vaccin</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL ajouter / modifier */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? "✏️ Modifier le vaccin" : "➕ Nouveau vaccin"}
              </Text>
              <TouchableOpacity onPress={resetForm}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.label}>Nom du vaccin *</Text>
              <TextInput
                style={styles.input}
                value={form.nom}
                onChangeText={(v) => setForm({ ...form, nom: v })}
                placeholder="Ex: BCG"
                placeholderTextColor={COLORS.textMuted}
                testID="input-vaccin-nom"
              />
              <Text style={styles.label}>Date de vaccination *</Text>
              <DateField
                value={form.date}
                mode="date"
                onChange={(v) => setForm({ ...form, date: v })}
                maximumDate={new Date()}
              />
              <Text style={styles.label}>Lieu (facultatif)</Text>
              <TextInput
                style={styles.input}
                value={form.lieu}
                onChangeText={(v) => setForm({ ...form, lieu: v })}
                placeholder="Ex: PMI Cocody"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={styles.label}>Lot (facultatif)</Text>
              <TextInput
                style={styles.input}
                value={form.lot}
                onChangeText={(v) => setForm({ ...form, lot: v })}
                placeholder="Numéro de lot du vaccin"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity onPress={saveVaccin} style={{ marginTop: 16 }} testID="save-vaccin-btn">
                <LinearGradient colors={["#10B981", "#22C55E"]} style={styles.saveBtn}>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveText}>{editingId ? "Enregistrer" : "Ajouter au carnet"}</Text>
                </LinearGradient>
              </TouchableOpacity>
              {editingId && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => { resetForm(); supprimer(editingId); }}
                >
                  <Ionicons name="trash" size={18} color="#DC2626" />
                  <Text style={styles.deleteBtnText}>Supprimer ce vaccin</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
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

  // Progression
  progressCard: {
    padding: 16,
    borderRadius: RADIUS.lg,
    marginBottom: 20,
    ...SHADOW.sm,
  },
  progressTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  progressCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 3, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  progressPct: { color: "#fff", fontSize: 18, fontWeight: "900" },
  progressTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  progressSub: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontWeight: "700", marginTop: 3 },
  progressHint: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 4 },
  progressBarWrap: {
    height: 6, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 3, marginTop: 12, overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: "#fff", borderRadius: 3 },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8, marginBottom: 10 },

  legendRow: { flexDirection: "row", gap: 14, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600" },

  // 💚 CARTE VACCIN FAIT (vert)
  cardDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#DCFCE7",  // vert clair
    borderRadius: RADIUS.md,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#10B981",  // vert vif
    borderLeftWidth: 5,
  },
  doneIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#10B981",
    alignItems: "center", justifyContent: "center",
  },
  doneHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  doneName: { fontSize: 15, fontWeight: "800", color: "#166534", flex: 1 },
  doneMeta: { fontSize: 12, color: "#166534", marginTop: 4, fontWeight: "600" },
  doneBadge: {
    backgroundColor: "#10B981",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  doneBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },

  // ⏳ CARTE VACCIN À FAIRE
  cardTodo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 5,
    borderLeftColor: "#F59E0B",
  },
  todoIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5,
  },
  todoName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, flex: 1 },
  todoMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  todoBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  todoBadgeText: { color: "#B45309", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 999,
    marginTop: 10, borderWidth: 1, borderColor: "#DC2626",
  },
  deleteBtnText: { color: "#DC2626", fontWeight: "800", fontSize: 14 },
});
