import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Enfants() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [vaccinModal, setVaccinModal] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", date_naissance: "", sexe: "F", poids_kg: "", taille_cm: "" });
  const [vaccin, setVaccin] = useState({ nom: "", date: "" });

  const load = async () => {
    try {
      const { data } = await api.get("/enfants");
      setList(data);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!form.nom || !form.date_naissance) return Alert.alert("Champs requis", "Nom et date de naissance");
    try {
      await api.post("/enfants", {
        nom: form.nom,
        date_naissance: form.date_naissance,
        sexe: form.sexe,
        poids_kg: form.poids_kg ? parseFloat(form.poids_kg) : undefined,
        taille_cm: form.taille_cm ? parseFloat(form.taille_cm) : undefined,
      });
      setForm({ nom: "", date_naissance: "", sexe: "F", poids_kg: "", taille_cm: "" });
      setModal(false);
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const addVaccin = async () => {
    if (!vaccin.nom || !vaccin.date || !vaccinModal) return;
    try {
      await api.post(`/enfants/${vaccinModal}/vaccins`, { nom: vaccin.nom, date: vaccin.date, fait: true });
      setVaccin({ nom: "", date: "" });
      setVaccinModal(null);
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const remove = (id: string) => {
    Alert.alert("Supprimer ?", "Confirmer la suppression", [
      { text: "Annuler" },
      { text: "Supprimer", style: "destructive", onPress: async () => { await api.delete(`/enfants/${id}`); load(); } },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes enfants</Text>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addHeader} testID="add-enfant-btn">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👶</Text>
            <Text style={styles.emptyTitle}>Aucun enfant enregistré</Text>
            <Text style={styles.emptyText}>Ajoutez votre premier enfant pour suivre son carnet de santé.</Text>
          </View>
        ) : (
          list.map((e) => {
            const age = Math.floor((Date.now() - new Date(e.date_naissance).getTime()) / (365 * 86400000));
            const months = Math.floor(((Date.now() - new Date(e.date_naissance).getTime()) / (30 * 86400000))) % 12;
            return (
              <View key={e.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardEmoji}>{e.sexe === "F" ? "👧" : "👦"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{e.nom}</Text>
                    <Text style={styles.cardSub}>{age} an(s) {months} mois · {e.sexe === "F" ? "Fille" : "Garçon"}</Text>
                  </View>
                  <TouchableOpacity onPress={() => remove(e.id)}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Poids</Text>
                    <Text style={styles.metricValue}>{e.poids_kg ? `${e.poids_kg} kg` : "-"}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Taille</Text>
                    <Text style={styles.metricValue}>{e.taille_cm ? `${e.taille_cm} cm` : "-"}</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Vaccins</Text>
                    <Text style={styles.metricValue}>{(e.vaccins || []).length}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.sectionTitle}>Carnet de vaccination</Text>
                  {(e.vaccins || []).length === 0 ? (
                    <Text style={styles.noItems}>Aucun vaccin enregistré</Text>
                  ) : (
                    (e.vaccins || []).map((v: any) => (
                      <View key={v.id} style={styles.vaccinRow}>
                        <Ionicons name={v.fait ? "checkmark-circle" : "time-outline"} size={18} color={v.fait ? COLORS.success : COLORS.warning} />
                        <Text style={styles.vaccinNom}>{v.nom}</Text>
                        <Text style={styles.vaccinDate}>{new Date(v.date).toLocaleDateString("fr-FR")}</Text>
                      </View>
                    ))
                  )}
                  <TouchableOpacity style={styles.btnLink} onPress={() => setVaccinModal(e.id)} testID={`add-vaccin-${e.id}`}>
                    <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.btnLinkText}>Ajouter un vaccin</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Create child modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouvel enfant</Text>
                <TouchableOpacity onPress={() => setModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
              <Label text="Nom / Prénom" />
              <TextInput style={styles.input} value={form.nom} onChangeText={(v) => setForm({ ...form, nom: v })} testID="enfant-nom" />
              <Label text="Date de naissance (YYYY-MM-DD)" />
              <TextInput style={styles.input} value={form.date_naissance} onChangeText={(v) => setForm({ ...form, date_naissance: v })} placeholder="2024-06-15" placeholderTextColor={COLORS.textMuted} testID="enfant-dob" />
              <Label text="Sexe" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {["F", "M"].map((s) => (
                  <TouchableOpacity key={s} style={[styles.sexBtn, form.sexe === s && styles.sexBtnActive]} onPress={() => setForm({ ...form, sexe: s })} testID={`enfant-sexe-${s}`}>
                    <Text style={[styles.sexText, form.sexe === s && { color: "#fff" }]}>{s === "F" ? "👧 Fille" : "👦 Garçon"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label text="Poids (kg)" />
                  <TextInput style={styles.input} value={form.poids_kg} onChangeText={(v) => setForm({ ...form, poids_kg: v })} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Label text="Taille (cm)" />
                  <TextInput style={styles.input} value={form.taille_cm} onChangeText={(v) => setForm({ ...form, taille_cm: v })} keyboardType="decimal-pad" />
                </View>
              </View>
              <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-enfant-btn">
                <Text style={styles.btnPrimaryText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Vaccin modal */}
      <Modal visible={!!vaccinModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Ajouter un vaccin</Text>
              <TouchableOpacity onPress={() => setVaccinModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Label text="Nom du vaccin" />
            <TextInput style={styles.input} value={vaccin.nom} onChangeText={(v) => setVaccin({ ...vaccin, nom: v })} placeholder="BCG, DTP, ROR..." placeholderTextColor={COLORS.textMuted} testID="vaccin-nom" />
            <Label text="Date (YYYY-MM-DD)" />
            <TextInput style={styles.input} value={vaccin.date} onChangeText={(v) => setVaccin({ ...vaccin, date: v })} placeholder="2026-01-15" placeholderTextColor={COLORS.textMuted} testID="vaccin-date" />
            <TouchableOpacity style={styles.btnPrimary} onPress={addVaccin} testID="save-vaccin-btn">
              <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const Label = ({ text }: { text: string }) => <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 }}>{text}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  addHeader: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40 },
  emptyIcon: { fontSize: 54 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 10 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  cardEmoji: { fontSize: 42 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  cardSub: { color: COLORS.textSecondary, fontSize: 12 },
  metricsRow: { flexDirection: "row", gap: 10 },
  metric: { flex: 1, backgroundColor: COLORS.secondaryLight, padding: 10, borderRadius: RADIUS.md, alignItems: "center" },
  metricLabel: { fontSize: 10, color: COLORS.textSecondary, textTransform: "uppercase", fontWeight: "600" },
  metricValue: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 15, marginTop: 2 },
  sectionTitle: { fontWeight: "700", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  noItems: { color: COLORS.textMuted, fontStyle: "italic", fontSize: 12 },
  vaccinRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  vaccinNom: { flex: 1, color: COLORS.textPrimary, fontWeight: "500" },
  vaccinDate: { color: COLORS.textSecondary, fontSize: 12 },
  btnLink: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 8 },
  btnLinkText: { color: COLORS.primary, fontWeight: "600" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "90%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  sexBtn: { flex: 1, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  sexBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sexText: { color: COLORS.textPrimary, fontWeight: "600" },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
