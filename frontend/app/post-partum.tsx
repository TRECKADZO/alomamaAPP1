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
import DateField from "../components/DateField";

const SYMPTOMES = ["Tristesse", "Anxiété", "Fatigue extrême", "Insomnie", "Irritabilité", "Pleurs fréquents", "Perte d'appétit"];

export default function PostPartum() {
  const router = useRouter();
  const [humeurs, setHumeurs] = useState<any[]>([]);
  const [allaitement, setAllaitement] = useState<any[]>([]);
  const [enfants, setEnfants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"humeur" | "allaitement">("humeur");
  const [modalH, setModalH] = useState(false);
  const [modalA, setModalA] = useState(false);
  const [humForm, setHumForm] = useState({ date: "", score: 5, notes: "", symptomes: [] as string[] });
  const [allForm, setAllForm] = useState({ enfant_id: "", date: "", duree_minutes: "10", cote: "gauche", notes: "" });

  const load = async () => {
    try {
      const [h, a, e] = await Promise.all([
        api.get("/humeur"), api.get("/allaitement"), api.get("/enfants"),
      ]);
      setHumeurs(h.data); setAllaitement(a.data); setEnfants(e.data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const createHumeur = async () => {
    if (!humForm.date) return Alert.alert("Date requise");
    try {
      await api.post("/humeur", humForm);
      setHumForm({ date: "", score: 5, notes: "", symptomes: [] });
      setModalH(false); load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const createAllaitement = async () => {
    if (!allForm.enfant_id || !allForm.date) return Alert.alert("Enfant et date requis");
    try {
      await api.post("/allaitement", {
        enfant_id: allForm.enfant_id,
        date: allForm.date,
        duree_minutes: parseInt(allForm.duree_minutes) || 10,
        cote: allForm.cote,
        notes: allForm.notes,
      });
      setAllForm({ enfant_id: "", date: "", duree_minutes: "10", cote: "gauche", notes: "" });
      setModalA(false); load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const toggleSymptome = (s: string) => {
    setHumForm((f) => ({
      ...f,
      symptomes: f.symptomes.includes(s) ? f.symptomes.filter((x) => x !== s) : [...f.symptomes, s],
    }));
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const avgHumeur = humeurs.length > 0 ? (humeurs.reduce((s, h) => s + h.score, 0) / humeurs.length).toFixed(1) : "—";
  const alerte = humeurs.slice(0, 3).filter((h) => h.score <= 3).length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Post-partum</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "humeur" && styles.tabActive]} onPress={() => setTab("humeur")} testID="tab-humeur">
          <Text style={[styles.tabText, tab === "humeur" && styles.tabTextActive]}>💛 Humeur</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "allaitement" && styles.tabActive]} onPress={() => setTab("allaitement")} testID="tab-allaitement">
          <Text style={[styles.tabText, tab === "allaitement" && styles.tabTextActive]}>🤱 Allaitement</Text>
        </TouchableOpacity>
      </View>

      {tab === "humeur" ? (
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{avgHumeur}</Text>
            <Text style={styles.summaryLabel}>Humeur moyenne /10</Text>
          </View>

          {alerte && (
            <View style={styles.alert}>
              <Ionicons name="warning" size={20} color={COLORS.error} />
              <Text style={styles.alertText}>Humeur basse fréquente — pensez à consulter un professionnel de santé mentale.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.btnAdd} onPress={() => setModalH(true)} testID="add-humeur-btn">
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.btnAddText}>Enregistrer mon humeur</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Historique</Text>
          {humeurs.length === 0 ? <Text style={styles.empty}>Aucune entrée</Text> : humeurs.map((h) => (
            <View key={h.id} style={styles.card}>
              <View style={[styles.scoreChip, { backgroundColor: scoreColor(h.score) + "22" }]}>
                <Text style={[styles.scoreText, { color: scoreColor(h.score) }]}>{h.score}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{new Date(h.date).toLocaleDateString("fr-FR")}</Text>
                {h.symptomes?.length > 0 && <Text style={styles.cardMeta}>{h.symptomes.join(", ")}</Text>}
                {h.notes && <Text style={styles.cardNotes}>{h.notes}</Text>}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{allaitement.length}</Text>
            <Text style={styles.summaryLabel}>Tétées enregistrées</Text>
          </View>

          <TouchableOpacity style={styles.btnAdd} onPress={() => setModalA(true)} testID="add-tete-btn">
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.btnAddText}>Ajouter une tétée</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Historique</Text>
          {allaitement.length === 0 ? <Text style={styles.empty}>Aucune tétée</Text> : allaitement.map((a) => {
            const enfant = enfants.find((e) => e.id === a.enfant_id);
            return (
              <View key={a.id} style={styles.card}>
                <Ionicons name="water" size={22} color={COLORS.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{enfant?.nom || "?"} · {a.duree_minutes} min</Text>
                  <Text style={styles.cardMeta}>{new Date(a.date).toLocaleString("fr-FR")} · {a.cote}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Humeur modal */}
      <Modal visible={modalH} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Mon humeur aujourd'hui</Text>
                <TouchableOpacity onPress={() => setModalH(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Date</Text>
              <DateField value={humForm.date} onChange={(v) => setHumForm({ ...humForm, date: v })} maximumDate={new Date()} placeholder="Choisir la date" testID="humeur-date" />
              <Text style={styles.label}>Score: {humForm.score}/10</Text>
              <View style={styles.scoreRow}>
                {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                  <TouchableOpacity key={n} style={[styles.scoreDot, humForm.score === n && styles.scoreDotActive]} onPress={() => setHumForm({ ...humForm, score: n })}>
                    <Text style={[styles.scoreDotText, humForm.score === n && { color: "#fff" }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Symptômes</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {SYMPTOMES.map((s) => (
                  <TouchableOpacity key={s} style={[styles.sympChip, humForm.symptomes.includes(s) && styles.sympChipActive]} onPress={() => toggleSymptome(s)}>
                    <Text style={[styles.sympText, humForm.symptomes.includes(s) && { color: "#fff" }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, { height: 70 }]} multiline value={humForm.notes} onChangeText={(v) => setHumForm({ ...humForm, notes: v })} />
              <TouchableOpacity style={styles.btnPrimary} onPress={createHumeur} testID="save-humeur-btn">
                <Text style={styles.btnPrimaryText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Allaitement modal */}
      <Modal visible={modalA} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouvelle tétée</Text>
                <TouchableOpacity onPress={() => setModalA(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Enfant</Text>
              {enfants.map((e) => (
                <TouchableOpacity key={e.id} style={[styles.enfantRow, allForm.enfant_id === e.id && styles.enfantRowActive]} onPress={() => setAllForm({ ...allForm, enfant_id: e.id })}>
                  <Text>{e.sexe === "F" ? "👧" : "👦"} {e.nom}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.label}>Date & heure</Text>
              <DateField value={allForm.date} onChange={(v) => setAllForm({ ...allForm, date: v })} mode="datetime" placeholder="Choisir date et heure" />
              <Text style={styles.label}>Durée (min)</Text>
              <TextInput style={styles.input} value={allForm.duree_minutes} onChangeText={(v) => setAllForm({ ...allForm, duree_minutes: v })} keyboardType="number-pad" />
              <Text style={styles.label}>Côté</Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {["gauche", "droit", "les_deux", "biberon"].map((c) => (
                  <TouchableOpacity key={c} style={[styles.sympChip, allForm.cote === c && styles.sympChipActive]} onPress={() => setAllForm({ ...allForm, cote: c })}>
                    <Text style={[styles.sympText, allForm.cote === c && { color: "#fff" }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.btnPrimary} onPress={createAllaitement} testID="save-tete-btn">
                <Text style={styles.btnPrimaryText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function scoreColor(s: number) {
  if (s <= 3) return "#DC2626";
  if (s <= 6) return "#F59E0B";
  return "#16A34A";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: SPACING.xl, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: COLORS.textPrimary, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  summary: { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", marginBottom: 14 },
  summaryValue: { fontSize: 40, fontWeight: "800", color: COLORS.primary },
  summaryLabel: { color: COLORS.textSecondary, marginTop: 4 },
  alert: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#FEE2E2", padding: 14, borderRadius: RADIUS.md, marginBottom: 14 },
  alertText: { flex: 1, color: COLORS.error, fontSize: 13, fontWeight: "500" },
  btnAdd: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, marginBottom: 20 },
  btnAddText: { color: "#fff", fontWeight: "700" },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 15, marginBottom: 10 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 20, fontStyle: "italic" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  scoreChip: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  scoreText: { fontWeight: "800", fontSize: 18 },
  cardTitle: { fontWeight: "700", color: COLORS.textPrimary },
  cardMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cardNotes: { color: COLORS.textPrimary, fontSize: 13, marginTop: 2, fontStyle: "italic" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "90%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  scoreRow: { flexDirection: "row", gap: 4, justifyContent: "space-between" },
  scoreDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  scoreDotActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  scoreDotText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
  sympChip: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  sympChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sympText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "500" },
  enfantRow: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  enfantRowActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
