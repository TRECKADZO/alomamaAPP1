import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

const METHODES = [
  { key: "pilule", label: "Pilule", icon: "medical" },
  { key: "sterilet", label: "Stérilet", icon: "shield" },
  { key: "preservatif", label: "Préservatif", icon: "leaf" },
  { key: "implant", label: "Implant", icon: "hardware-chip" },
  { key: "injection", label: "Injection", icon: "water" },
  { key: "naturel", label: "Naturel", icon: "flower" },
];

export default function Contraception() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ methode: "pilule", date_debut: "", notes: "" });

  const load = async () => {
    try { const { data } = await api.get("/contraception"); setList(data); } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!form.date_debut) return Alert.alert("Date requise");
    try {
      await api.post("/contraception", form);
      setForm({ methode: "pilule", date_debut: "", notes: "" });
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const endMethod = async (cid: string) => {
    const today = new Date().toISOString().split("T")[0];
    try { await api.patch(`/contraception/${cid}/end?date_fin=${today}`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  const active = list.find((x) => x.active);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Contraception</Text>
        <TouchableOpacity style={styles.add} onPress={() => setModal(true)} testID="add-contra-btn"><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {active && (
          <View style={styles.activeCard}>
            <View style={styles.activeIcon}>
              <Ionicons name={(METHODES.find((m) => m.key === active.methode)?.icon as any) || "medical"} size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.activeLabel}>MÉTHODE ACTUELLE</Text>
            <Text style={styles.activeMethode}>{METHODES.find((m) => m.key === active.methode)?.label || active.methode}</Text>
            <Text style={styles.activeDate}>Depuis le {new Date(active.date_debut).toLocaleDateString("fr-FR")}</Text>
            <TouchableOpacity style={styles.endBtn} onPress={() => endMethod(active.id)} testID="end-contra-btn">
              <Text style={styles.endBtnText}>Arrêter</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Historique</Text>
        {list.filter((x) => !x.active).map((c) => (
          <View key={c.id} style={styles.card}>
            <Ionicons name={(METHODES.find((m) => m.key === c.methode)?.icon as any) || "medical"} size={22} color={COLORS.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{METHODES.find((m) => m.key === c.methode)?.label || c.methode}</Text>
              <Text style={styles.cardMeta}>{new Date(c.date_debut).toLocaleDateString("fr-FR")} → {c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"}</Text>
            </View>
          </View>
        ))}
        {list.length === 0 && <Text style={styles.empty}>Aucune méthode enregistrée</Text>}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouvelle méthode</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Méthode</Text>
            <View style={styles.methodGrid}>
              {METHODES.map((m) => (
                <TouchableOpacity key={m.key} style={[styles.methodBtn, form.methode === m.key && styles.methodBtnActive]} onPress={() => setForm({ ...form, methode: m.key })} testID={`method-${m.key}`}>
                  <Ionicons name={m.icon as any} size={20} color={form.methode === m.key ? "#fff" : COLORS.primary} />
                  <Text style={[styles.methodText, form.methode === m.key && { color: "#fff" }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Date de début</Text>
            <TextInput style={styles.input} value={form.date_debut} onChangeText={(v) => setForm({ ...form, date_debut: v })} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} testID="contra-date" />
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { height: 60 }]} multiline value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />
            <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-contra-btn">
              <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  activeCard: { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", marginBottom: 20 },
  activeIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  activeLabel: { color: COLORS.primary, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  activeMethode: { color: COLORS.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 4 },
  activeDate: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  endBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#fff", borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.primary },
  endBtnText: { color: COLORS.primary, fontWeight: "700" },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 15, marginBottom: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontWeight: "700", color: COLORS.textPrimary },
  cardMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 20, fontStyle: "italic" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  methodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  methodText: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
