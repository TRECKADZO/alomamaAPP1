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

export default function Cycle() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date_debut_regles: "", duree_regles: "5", duree_cycle: "28", notes: "" });

  const load = async () => {
    try {
      const { data } = await api.get("/cycle");
      setList(data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!form.date_debut_regles) return Alert.alert("Date requise");
    try {
      await api.post("/cycle", {
        date_debut_regles: form.date_debut_regles,
        duree_regles: parseInt(form.duree_regles) || 5,
        duree_cycle: parseInt(form.duree_cycle) || 28,
        notes: form.notes,
      });
      setForm({ date_debut_regles: "", duree_regles: "5", duree_cycle: "28", notes: "" });
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const dernier = list[0];
  let predictions: any = null;
  if (dernier) {
    const debut = new Date(dernier.date_debut_regles);
    const cycle = dernier.duree_cycle || 28;
    const prochaines = new Date(debut.getTime() + cycle * 86400000);
    const ovulation = new Date(debut.getTime() + (cycle - 14) * 86400000);
    const fertiliteStart = new Date(ovulation.getTime() - 5 * 86400000);
    const fertiliteEnd = new Date(ovulation.getTime() + 1 * 86400000);
    predictions = { prochaines, ovulation, fertiliteStart, fertiliteEnd };
  }

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Cycle menstruel</Text>
        <TouchableOpacity style={styles.add} onPress={() => setModal(true)} testID="add-cycle-btn">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {predictions && (
          <View style={styles.predCard}>
            <Text style={styles.predLabel}>🌸 PRÉVISIONS</Text>
            <PredRow icon="flower" label="Prochaines règles" value={predictions.prochaines.toLocaleDateString("fr-FR")} color="#E11D48" />
            <PredRow icon="egg" label="Ovulation prévue" value={predictions.ovulation.toLocaleDateString("fr-FR")} color="#10B981" />
            <PredRow icon="heart" label="Période fertile" value={`${predictions.fertiliteStart.toLocaleDateString("fr-FR")} → ${predictions.fertiliteEnd.toLocaleDateString("fr-FR")}`} color="#F59E0B" />
          </View>
        )}

        <Text style={styles.sectionTitle}>Historique ({list.length})</Text>
        {list.length === 0 ? (
          <Text style={styles.empty}>Ajoutez votre premier cycle</Text>
        ) : (
          list.map((c) => (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="flower-outline" size={22} color={COLORS.primary} />
                <Text style={styles.cardTitle}>{new Date(c.date_debut_regles).toLocaleDateString("fr-FR")}</Text>
              </View>
              <Text style={styles.cardMeta}>Règles: {c.duree_regles}j · Cycle: {c.duree_cycle}j</Text>
              {c.notes && <Text style={styles.cardNotes}>{c.notes}</Text>}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouveau cycle</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Label text="Date de début des règles (YYYY-MM-DD)" />
            <TextInput style={styles.input} value={form.date_debut_regles} onChangeText={(v) => setForm({ ...form, date_debut_regles: v })} placeholder="2026-04-15" placeholderTextColor={COLORS.textMuted} testID="cycle-date" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Label text="Durée règles (j)" />
                <TextInput style={styles.input} value={form.duree_regles} onChangeText={(v) => setForm({ ...form, duree_regles: v })} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Label text="Cycle total (j)" />
                <TextInput style={styles.input} value={form.duree_cycle} onChangeText={(v) => setForm({ ...form, duree_cycle: v })} keyboardType="number-pad" />
              </View>
            </View>
            <Label text="Notes" />
            <TextInput style={[styles.input, { height: 70 }]} multiline value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Symptômes, douleurs..." placeholderTextColor={COLORS.textMuted} />
            <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-cycle-btn">
              <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function PredRow({ icon, label, value, color }: any) {
  return (
    <View style={styles.predRow}>
      <View style={[styles.predIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.predRowLabel}>{label}</Text>
        <Text style={styles.predRowValue}>{value}</Text>
      </View>
    </View>
  );
}
const Label = ({ text }: { text: string }) => <Text style={styles.label}>{text}</Text>;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  predCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  predLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  predRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  predIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  predRowLabel: { color: COLORS.textSecondary, fontSize: 12 },
  predRowValue: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 15 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 15, marginBottom: 10 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 20, fontStyle: "italic" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontWeight: "700", color: COLORS.textPrimary },
  cardMeta: { color: COLORS.textSecondary, fontSize: 12 },
  cardNotes: { color: COLORS.textPrimary, fontSize: 13, marginTop: 4, fontStyle: "italic" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
