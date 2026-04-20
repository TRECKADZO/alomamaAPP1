import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

// Consultations prénatales (base44 source)
const CONSULTATIONS_PRENATALES = [
  { semaine: 8, titre: "1ère consultation prénatale" },
  { semaine: 12, titre: "Échographie de datation" },
  { semaine: 16, titre: "2ème consultation" },
  { semaine: 20, titre: "Échographie morphologique" },
  { semaine: 24, titre: "3ème consultation" },
  { semaine: 28, titre: "4ème consultation + vaccin coqueluche" },
  { semaine: 32, titre: "Échographie de croissance" },
  { semaine: 36, titre: "Consultation pré-accouchement" },
  { semaine: 39, titre: "Consultation terme" },
];

// Développement bébé par semaine
const DEVELOPPEMENT_BEBE: Record<number, { taille: string; poids: string; fruit: string; description: string }> = {
  4:  { taille: "2 mm", poids: "0.4 g", fruit: "🌱 Graine de pavot", description: "Tube neural en formation" },
  8:  { taille: "1.6 cm", poids: "1 g", fruit: "🫐 Framboise", description: "Battements de cœur visibles" },
  12: { taille: "5.4 cm", poids: "14 g", fruit: "🍋 Citron vert", description: "Tous les organes sont formés" },
  16: { taille: "11 cm", poids: "100 g", fruit: "🥑 Avocat", description: "Premiers mouvements perceptibles" },
  20: { taille: "25 cm", poids: "300 g", fruit: "🍌 Banane", description: "Mi-parcours · cheveux, sourcils" },
  24: { taille: "30 cm", poids: "600 g", fruit: "🌽 Épi de maïs", description: "Empreintes digitales, viabilité" },
  28: { taille: "37 cm", poids: "1 kg", fruit: "🍆 Aubergine", description: "Ouvre les yeux, rêve" },
  32: { taille: "42 cm", poids: "1.7 kg", fruit: "🥥 Noix de coco", description: "Graisse sous-cutanée" },
  36: { taille: "47 cm", poids: "2.6 kg", fruit: "🥬 Laitue romaine", description: "Poumons presque matures" },
  40: { taille: "51 cm", poids: "3.4 kg", fruit: "🎃 Citrouille", description: "Prêt à rencontrer le monde !" },
};

function closestWeek(w: number): number {
  const keys = Object.keys(DEVELOPPEMENT_BEBE).map(Number);
  return keys.reduce((p, c) => (Math.abs(c - w) < Math.abs(p - w) ? c : p), keys[0]);
}

export default function Grossesse() {
  const router = useRouter();
  const [g, setG] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [dateTerme, setDateTerme] = useState("");
  const [notes, setNotes] = useState("");
  const [symptome, setSymptome] = useState("");

  const load = async () => {
    try { const { data } = await api.get("/grossesse"); setG(data); }
    catch { setG(null); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!dateDebut) return Alert.alert("Date début requise");
    try {
      const { data } = await api.post("/grossesse", { date_debut: dateDebut, date_terme: dateTerme || undefined, notes, symptomes: [] });
      setG(data);
      setModal(false);
      setDateDebut(""); setDateTerme(""); setNotes("");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const addSymptome = async () => {
    if (!symptome.trim() || !g) return;
    try {
      const { data } = await api.patch(`/grossesse/${g.id}`, {
        date_debut: g.date_debut,
        symptomes: [...(g.symptomes || []), symptome.trim()],
      });
      setG(data);
      setSymptome("");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  // --- Calculs (identiques au source) ---
  let info: any = null;
  if (g) {
    const today = new Date();
    const ddr = new Date(g.date_debut);
    const joursDepuisDDR = Math.floor((today.getTime() - ddr.getTime()) / 86400000);
    const semainesGrossesse = Math.max(0, Math.floor(joursDepuisDDR / 7));
    const joursRestants = Math.max(0, joursDepuisDDR % 7);
    const trimestre = semainesGrossesse < 14 ? 1 : semainesGrossesse < 28 ? 2 : 3;
    const dpa = g.date_terme ? new Date(g.date_terme) : new Date(ddr.getTime() + 280 * 86400000);
    const joursAvantAccouchement = Math.max(0, Math.floor((dpa.getTime() - today.getTime()) / 86400000));
    const semainesAvantAccouchement = Math.floor(joursAvantAccouchement / 7);
    const pourcentageProgression = Math.min(100, Math.round((Math.min(semainesGrossesse, 40) / 40) * 100));
    const prochaineConsult = CONSULTATIONS_PRENATALES.find((c) => c.semaine > semainesGrossesse);
    info = { semainesGrossesse, joursRestants, trimestre, dpa, joursAvantAccouchement, semainesAvantAccouchement, pourcentageProgression, prochaineConsult };
  }

  const dev = info ? DEVELOPPEMENT_BEBE[closestWeek(Math.min(info.semainesGrossesse, 40))] : null;
  const trimColor = info ? (info.trimestre === 1 ? "#EC4899" : info.trimestre === 2 ? "#A855F7" : "#3B82F6") : COLORS.primary;
  const trimBg = info ? (info.trimestre === 1 ? "#FCE7F3" : info.trimestre === 2 ? "#F3E8FF" : "#DBEAFE") : COLORS.primaryLight;

  const sections = [
    { id: "developpement", label: "Développement", icon: "egg", color: "#EC4899" },
    { id: "trimestres", label: "Par Trimestre", icon: "calendar", color: "#A855F7" },
    { id: "evolution", label: "Évolution Bébé", icon: "pulse", color: "#F97316" },
    { id: "symptomes", label: "Symptômes", icon: "clipboard", color: "#8B5CF6" },
    { id: "nutrition", label: "Nutrition", icon: "nutrition", color: "#10B981" },
    { id: "poids", label: "Suivi Poids", icon: "fitness", color: "#F59E0B" },
    { id: "tension", label: "Tension", icon: "heart", color: "#E11D48" },
    { id: "echographies", label: "Échographies", icon: "scan", color: "#06B6D4", nav: "/tele-echo" },
    { id: "consultations", label: "Consultations", icon: "medkit", color: "#14B8A6", nav: "/(tabs)/rdv" },
    { id: "vaccins", label: "Vaccins", icon: "shield-checkmark", color: "#22C55E" },
    { id: "journal", label: "Journal", icon: "document-text", color: "#6B7280" },
    { id: "rappels", label: "Rappels", icon: "notifications", color: "#EF4444" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Ma grossesse</Text>
        {g && (
          <TouchableOpacity style={styles.editBtn} onPress={() => setModal(true)}>
            <Ionicons name="settings-outline" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
        {!g ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🤰</Text>
            <Text style={styles.emptyTitle}>Configurez votre grossesse</Text>
            <Text style={styles.emptyText}>Renseignez la date de vos dernières règles pour démarrer un suivi personnalisé semaine par semaine.</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setModal(true)} testID="create-grossesse-btn">
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.btnPrimaryText}>Configurer ma grossesse</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Hero card avec calculs complets */}
            <View style={[styles.heroCard, { backgroundColor: trimColor }]}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.trimBadge}>TRIMESTRE {info.trimestre}</Text>
                  <Text style={styles.heroWeek}>{info.semainesGrossesse} SA</Text>
                  <Text style={styles.heroWeekSub}>+ {info.joursRestants} j</Text>
                </View>
                <View style={styles.heroProgress}>
                  <View style={styles.heroProgressRing}>
                    <Text style={styles.heroProgressValue}>{info.pourcentageProgression}%</Text>
                  </View>
                  <Text style={styles.heroProgressLabel}>de grossesse</Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${info.pourcentageProgression}%` }]} />
              </View>
              <View style={styles.heroBottom}>
                <View style={styles.heroInfo}>
                  <Text style={styles.heroInfoLabel}>DPA</Text>
                  <Text style={styles.heroInfoValue}>{info.dpa.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                </View>
                <View style={styles.heroInfo}>
                  <Text style={styles.heroInfoLabel}>Accouchement dans</Text>
                  <Text style={styles.heroInfoValue}>{info.semainesAvantAccouchement} sem · {info.joursAvantAccouchement} j</Text>
                </View>
              </View>
            </View>

            {/* Développement du bébé cette semaine */}
            {dev && (
              <View style={styles.bebeCard}>
                <Text style={styles.bebeLabel}>🍼 CETTE SEMAINE, BÉBÉ A LA TAILLE D'UN</Text>
                <Text style={styles.bebeFruit}>{dev.fruit}</Text>
                <View style={styles.bebeStats}>
                  <View style={styles.bebeStat}>
                    <Text style={styles.bebeStatValue}>{dev.taille}</Text>
                    <Text style={styles.bebeStatLabel}>Taille</Text>
                  </View>
                  <View style={styles.bebeStat}>
                    <Text style={styles.bebeStatValue}>{dev.poids}</Text>
                    <Text style={styles.bebeStatLabel}>Poids</Text>
                  </View>
                </View>
                <Text style={styles.bebeDesc}>{dev.description}</Text>
              </View>
            )}

            {/* Prochaine consultation prénatale suggérée */}
            {info.prochaineConsult && (
              <View style={[styles.prochaineCard, { backgroundColor: trimBg }]}>
                <View style={[styles.prochaineIcon, { backgroundColor: trimColor }]}>
                  <Ionicons name="alarm" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prochaineLabel}>PROCHAINE ÉTAPE CLÉ</Text>
                  <Text style={styles.prochaineTitle}>{info.prochaineConsult.titre}</Text>
                  <Text style={styles.prochaineSub}>À la semaine {info.prochaineConsult.semaine} · dans {info.prochaineConsult.semaine - info.semainesGrossesse} semaine(s)</Text>
                </View>
              </View>
            )}

            {/* Sections grille */}
            <Text style={styles.sectionTitle}>Suivi complet</Text>
            <View style={styles.grid}>
              {sections.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.gridItem}
                  onPress={() => s.nav ? router.push(s.nav as any) : Alert.alert(s.label, "Bientôt disponible dans la prochaine mise à jour")}
                  testID={`section-${s.id}`}
                >
                  <View style={[styles.gridIcon, { backgroundColor: s.color + "1A" }]}>
                    <Ionicons name={s.icon as any} size={22} color={s.color} />
                  </View>
                  <Text style={styles.gridLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Symptômes */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mes symptômes</Text>
              <View style={styles.chipsWrap}>
                {(g.symptomes || []).map((s: string, i: number) => (
                  <View key={i} style={[styles.chip, { backgroundColor: trimBg }]}>
                    <Text style={[styles.chipText, { color: trimColor }]}>{s}</Text>
                  </View>
                ))}
                {(!g.symptomes || g.symptomes.length === 0) && <Text style={styles.empty}>Aucun symptôme noté</Text>}
              </View>
              <View style={styles.inputRow}>
                <TextInput style={styles.input} placeholder="Ajouter un symptôme..." placeholderTextColor={COLORS.textMuted} value={symptome} onChangeText={setSymptome} testID="symptome-input" />
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: trimColor }]} onPress={addSymptome} testID="add-symptome-btn">
                  <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Notes */}
            {g.notes ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Notes</Text>
                <Text style={styles.noteText}>{g.notes}</Text>
              </View>
            ) : null}

            {/* Actions rapides */}
            <View style={{ gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: trimColor }]} onPress={() => router.push("/(tabs)/rdv")}>
                <Ionicons name="calendar" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Prendre un rendez-vous</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => router.push("/(tabs)/assistant")}>
                <Ionicons name="sparkles" size={18} color={COLORS.primary} />
                <Text style={styles.btnSecondaryText}>Questions à l'Assistant IA</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal configuration */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{g ? "Modifier" : "Configurer"} ma grossesse</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Date des dernières règles (DDR) *</Text>
            <TextInput style={styles.modalInput} value={dateDebut} onChangeText={setDateDebut} placeholder="2026-01-15" placeholderTextColor={COLORS.textMuted} testID="date-debut-input" />
            <Text style={styles.label}>Date prévue d'accouchement (DPA, optionnelle)</Text>
            <TextInput style={styles.modalInput} value={dateTerme} onChangeText={setDateTerme} placeholder="2026-10-22" placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.helperTxt}>Si vide, calculée automatiquement (DDR + 280 jours)</Text>
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.modalInput, { height: 70 }]} value={notes} onChangeText={setNotes} multiline placeholder="Observations, antécédents..." placeholderTextColor={COLORS.textMuted} testID="notes-input" />
            <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-grossesse-btn">
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
  editBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  emptyCard: { alignItems: "center", padding: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyEmoji: { fontSize: 60, marginBottom: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  heroCard: { borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: 14 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  trimBadge: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  heroWeek: { color: "#fff", fontSize: 44, fontWeight: "800", lineHeight: 50 },
  heroWeekSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600" },
  heroProgress: { alignItems: "center" },
  heroProgressRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" },
  heroProgressValue: { color: "#fff", fontWeight: "800", fontSize: 20 },
  heroProgressLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 4 },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 4, overflow: "hidden", marginBottom: 14 },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 4 },
  heroBottom: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  heroInfo: { flex: 1 },
  heroInfoLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroInfoValue: { color: "#fff", fontWeight: "700", fontSize: 13, marginTop: 2 },
  bebeCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  bebeLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textSecondary, letterSpacing: 1, textAlign: "center" },
  bebeFruit: { fontSize: 28, fontWeight: "700", color: COLORS.textPrimary, marginVertical: 8, textAlign: "center" },
  bebeStats: { flexDirection: "row", gap: 20, marginVertical: 8 },
  bebeStat: { alignItems: "center" },
  bebeStatValue: { fontSize: 18, fontWeight: "800", color: COLORS.primary },
  bebeStatLabel: { fontSize: 11, color: COLORS.textSecondary, textTransform: "uppercase", fontWeight: "600" },
  bebeDesc: { color: COLORS.textSecondary, fontStyle: "italic", textAlign: "center", fontSize: 13 },
  prochaineCard: { flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderRadius: RADIUS.lg, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  prochaineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  prochaineLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textSecondary, letterSpacing: 1 },
  prochaineTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 2 },
  prochaineSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 15, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  gridItem: { width: "30%", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, flexGrow: 1 },
  gridIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  gridLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "600", textAlign: "center" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginBottom: 10 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  chipText: { fontWeight: "700", fontSize: 12 },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  addBtn: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  empty: { color: COLORS.textMuted, fontStyle: "italic" },
  noteText: { color: COLORS.textPrimary, lineHeight: 20 },
  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.surface, paddingVertical: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.primary },
  btnSecondaryText: { color: COLORS.primary, fontWeight: "700", fontSize: 14 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  helperTxt: { color: COLORS.textMuted, fontSize: 11, marginTop: 4, fontStyle: "italic" },
});
