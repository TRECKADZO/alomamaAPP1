import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, IMAGES, RADIUS, SPACING } from "../../constants/theme";

export default function Grossesse() {
  const [g, setG] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [notes, setNotes] = useState("");
  const [symptome, setSymptome] = useState("");
  const router = useRouter();

  const load = async () => {
    try {
      const { data } = await api.get("/grossesse");
      setG(data);
    } catch {
      setG(null);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!dateDebut) return Alert.alert("Date requise");
    try {
      const { data } = await api.post("/grossesse", { date_debut: dateDebut, notes, symptomes: [] });
      setG(data);
      setModal(false);
      setDateDebut(""); setNotes("");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const addSymptome = async () => {
    if (!symptome.trim() || !g) return;
    const newSymp = [...(g.symptomes || []), symptome.trim()];
    try {
      const { data } = await api.patch(`/grossesse/${g.id}`, {
        date_debut: g.date_debut,
        symptomes: newSymp,
      });
      setG(data);
      setSymptome("");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  }

  const rawWeeks = g ? Math.floor((Date.now() - new Date(g.date_debut).getTime()) / (7 * 86400000)) : 0;
  const weeks = Math.min(Math.max(rawWeeks, 0), 40);
  const progress = Math.min(weeks / 40, 1);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Ma grossesse</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
        {!g ? (
          <View style={styles.emptyCard}>
            <Image source={{ uri: IMAGES.heroMaman }} style={styles.emptyImg} />
            <Text style={styles.emptyTitle}>Démarrez votre suivi</Text>
            <Text style={styles.emptyText}>
              Enregistrez votre grossesse pour un suivi personnalisé semaine par semaine.
            </Text>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => setModal(true)}
              testID="create-grossesse-btn"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.btnPrimaryText}>Commencer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.bigCard}>
              <Text style={styles.weekLabel}>SEMAINE</Text>
              <Text style={styles.weekValue}>{weeks}</Text>
              <Text style={styles.weekSub}>sur 40 semaines</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.weekInfo}>
                {weeks < 14 ? "1er trimestre" : weeks < 28 ? "2ème trimestre" : "3ème trimestre"}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date de début</Text>
              <Text style={styles.infoValue}>{new Date(g.date_debut).toLocaleDateString("fr-FR")}</Text>
              {g.date_terme && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Date prévue d'accouchement</Text>
                  <Text style={styles.infoValue}>{new Date(g.date_terme).toLocaleDateString("fr-FR")}</Text>
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Symptômes</Text>
              <View style={styles.chipsWrap}>
                {(g.symptomes || []).map((s: string, i: number) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
                {(!g.symptomes || g.symptomes.length === 0) && (
                  <Text style={styles.empty}>Aucun symptôme noté</Text>
                )}
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Ajouter un symptôme..."
                  placeholderTextColor={COLORS.textMuted}
                  value={symptome}
                  onChangeText={setSymptome}
                  testID="symptome-input"
                />
                <TouchableOpacity style={styles.addBtn} onPress={addSymptome} testID="add-symptome-btn">
                  <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.infoValue}>{g.notes || "Aucune note"}</Text>
            </View>

            <TouchableOpacity
              style={[styles.btnPrimary, { marginTop: 16 }]}
              onPress={() => router.push("/(tabs)/rdv")}
            >
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Prendre un rendez-vous</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouvelle grossesse</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Date de début (ISO : 2026-01-15)</Text>
            <TextInput
              style={styles.modalInput}
              value={dateDebut}
              onChangeText={setDateDebut}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textMuted}
              testID="date-debut-input"
            />
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Observations..."
              placeholderTextColor={COLORS.textMuted}
              testID="notes-input"
            />
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={create}
              testID="save-grossesse-btn"
            >
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  emptyCard: { alignItems: "center", padding: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyImg: { width: 140, height: 140, borderRadius: 70, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  bigCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  weekLabel: { color: "#FFE7E0", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  weekValue: { color: "#fff", fontSize: 72, fontWeight: "900", lineHeight: 80 },
  weekSub: { color: "#FFD5CB", fontSize: 13, marginBottom: 16 },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 4,
    width: "100%",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 4 },
  weekInfo: { color: "#fff", fontWeight: "600", marginTop: 10, fontSize: 14 },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  infoValue: { color: COLORS.textSecondary, marginTop: 4, fontSize: 15 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, marginBottom: 10 },
  chip: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  chipText: { color: COLORS.primary, fontWeight: "600", fontSize: 12 },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: { flex: 1, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  addBtn: { width: 48, height: 48, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  empty: { color: COLORS.textMuted, fontStyle: "italic" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary, marginBottom: 10 },
});
