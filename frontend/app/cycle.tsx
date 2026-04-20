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

const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"];

type DayType = "regles" | "fertile" | "ovulation" | "predit" | null;

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function daysBetween(a: Date, b: Date) { return Math.floor((b.getTime() - a.getTime()) / 86400000); }

export default function Cycle() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const [form, setForm] = useState({ date_debut_regles: "", duree_regles: "5", duree_cycle: "28", notes: "" });

  const load = async () => {
    try { const { data } = await api.get("/cycle"); setList(data); } finally { setLoading(false); }
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

  // ---------- Calculs ----------
  const dernier = list[0];
  const durees = list.filter((c) => c.duree_cycle).map((c) => c.duree_cycle).slice(0, 6);
  const stats = durees.length
    ? { moyenne: Math.round(durees.reduce((a: number, b: number) => a + b, 0) / durees.length), min: Math.min(...durees), max: Math.max(...durees) }
    : null;

  const fertile = dernier
    ? (() => {
        const start = new Date(dernier.date_debut_regles);
        const cycleLen = dernier.duree_cycle || stats?.moyenne || 28;
        const ovulation = addDays(start, cycleLen - 14);
        const fertileStart = addDays(ovulation, -5);
        const fertileEnd = addDays(ovulation, 1);
        const next = addDays(start, cycleLen);
        const today = new Date();
        return {
          start, cycleLen, dureeRegles: dernier.duree_regles || 5,
          ovulation, fertileStart, fertileEnd, next,
          isInFertileWindow: today >= fertileStart && today <= fertileEnd,
          daysUntilOvulation: daysBetween(today, ovulation),
          daysUntilPeriod: daysBetween(today, next),
        };
      })()
    : null;

  // ---------- Rendu du mois courant ----------
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const firstDow = (monthStart.getDay() + 6) % 7; // lundi=0
  const daysInMonth = monthEnd.getDate();
  const gridDays: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) gridDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) gridDays.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (gridDays.length % 7 !== 0) gridDays.push(null);

  function typeOf(d: Date): DayType {
    // Règles historiques + prédites + fenêtre fertile
    for (const c of list) {
      const s = new Date(c.date_debut_regles);
      const dureeR = c.duree_regles || 5;
      for (let i = 0; i < dureeR; i++) if (sameDay(addDays(s, i), d)) return "regles";
    }
    if (fertile) {
      // Règles prédites prochaines
      for (let i = 0; i < fertile.dureeRegles; i++) if (sameDay(addDays(fertile.next, i), d)) return "predit";
      if (sameDay(fertile.ovulation, d)) return "ovulation";
      if (d >= fertile.fertileStart && d <= fertile.fertileEnd) return "fertile";
    }
    return null;
  }

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Cycle menstruel</Text>
        <TouchableOpacity style={styles.add} onPress={() => setModal(true)} testID="add-cycle-btn"><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {/* Alert fenêtre fertile */}
        {fertile?.isInFertileWindow && (
          <View style={styles.alertFertile}>
            <View style={styles.alertIcon}><Ionicons name="heart" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>🌸 Vous êtes en période fertile !</Text>
              <Text style={styles.alertText}>Ovulation estimée au {fertile.ovulation.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}.</Text>
              <View style={styles.alertRow}>
                <View style={styles.alertChip}>
                  <Text style={styles.alertChipLabel}>Ovulation dans</Text>
                  <Text style={styles.alertChipValue}>{fertile.daysUntilOvulation} j</Text>
                </View>
                <View style={styles.alertChip}>
                  <Text style={styles.alertChipLabel}>Fin fenêtre</Text>
                  <Text style={styles.alertChipValue}>{fertile.fertileEnd.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Prédictions clés */}
        {fertile && !fertile.isInFertileWindow && (
          <View style={styles.predictCard}>
            <Text style={styles.predictLabel}>PRÉVISIONS</Text>
            <PredictRow icon="water" color="#E11D48" label="Prochaines règles" value={fertile.next.toLocaleDateString("fr-FR")} sub={`dans ${Math.max(0, fertile.daysUntilPeriod)} jour(s)`} />
            <PredictRow icon="egg" color="#10B981" label="Ovulation prévue" value={fertile.ovulation.toLocaleDateString("fr-FR")} sub={fertile.daysUntilOvulation >= 0 ? `dans ${fertile.daysUntilOvulation} j` : `il y a ${-fertile.daysUntilOvulation} j`} />
            <PredictRow icon="heart" color="#F59E0B" label="Fenêtre fertile" value={`${fertile.fertileStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} → ${fertile.fertileEnd.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`} />
          </View>
        )}

        {/* Statistiques */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>📊 Mes statistiques</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.moyenne}</Text>
                <Text style={styles.statLabel}>Moyenne</Text>
              </View>
              <View style={[styles.statItem, styles.statItemMid]}>
                <Text style={styles.statValue}>{stats.min}</Text>
                <Text style={styles.statLabel}>Min</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.max}</Text>
                <Text style={styles.statLabel}>Max</Text>
              </View>
            </View>
            <Text style={styles.statsSub}>Sur les 6 derniers cycles (jours)</Text>
          </View>
        )}

        {/* Calendrier mensuel */}
        <View style={styles.calCard}>
          <View style={styles.calHead}>
            <TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} testID="cal-prev">
              <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.calMonth}>{MOIS_FR[cursor.getMonth()]} {cursor.getFullYear()}</Text>
            <TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} testID="cal-next">
              <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.dowRow}>
            {JOURS_FR.map((j, i) => <Text key={i} style={styles.dow}>{j}</Text>)}
          </View>

          <View style={styles.gridDays}>
            {gridDays.map((d, i) => {
              if (!d) return <View key={i} style={styles.dayEmpty} />;
              const t = typeOf(d);
              const today = sameDay(d, new Date());
              return (
                <View key={i} style={styles.dayCell}>
                  <View style={[
                    styles.dayInner,
                    t === "regles" && styles.dayRegles,
                    t === "predit" && styles.dayPredit,
                    t === "fertile" && styles.dayFertile,
                    t === "ovulation" && styles.dayOvulation,
                    today && styles.dayToday,
                  ]}>
                    <Text style={[
                      styles.dayNum,
                      (t === "regles" || t === "ovulation") && { color: "#fff", fontWeight: "800" },
                      today && !t && { color: COLORS.primary, fontWeight: "800" },
                    ]}>{d.getDate()}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <LegendDot color="#E11D48" label="Règles" />
            <LegendDot color="#FDA4B8" label="Règles prédites" />
            <LegendDot color="#FCD34D" label="Fenêtre fertile" />
            <LegendDot color="#10B981" label="Ovulation" />
          </View>
        </View>

        {/* Historique */}
        <Text style={styles.sectionTitle}>Historique ({list.length})</Text>
        {list.length === 0 ? (
          <Text style={styles.empty}>Ajoutez votre premier cycle pour démarrer le suivi</Text>
        ) : list.map((c) => (
          <View key={c.id} style={styles.histCard}>
            <View style={[styles.histIcon, { backgroundColor: "#FECDD3" }]}>
              <Ionicons name="water" size={18} color="#E11D48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.histTitle}>{new Date(c.date_debut_regles).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</Text>
              <Text style={styles.histMeta}>Règles {c.duree_regles}j · Cycle {c.duree_cycle}j</Text>
              {c.notes ? <Text style={styles.histNotes}>{c.notes}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouveau cycle</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Date début des règles (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={form.date_debut_regles} onChangeText={(v) => setForm({ ...form, date_debut_regles: v })} placeholder="2026-04-15" placeholderTextColor={COLORS.textMuted} testID="cycle-date" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Durée règles (j)</Text>
                <TextInput style={styles.input} value={form.duree_regles} onChangeText={(v) => setForm({ ...form, duree_regles: v })} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Cycle total (j)</Text>
                <TextInput style={styles.input} value={form.duree_cycle} onChangeText={(v) => setForm({ ...form, duree_cycle: v })} keyboardType="number-pad" />
              </View>
            </View>
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { height: 60 }]} multiline value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Symptômes, douleurs, humeur..." placeholderTextColor={COLORS.textMuted} />
            <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-cycle-btn">
              <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function PredictRow({ icon, color, label, value, sub }: any) {
  return (
    <View style={styles.predictRow}>
      <View style={[styles.predictIcon, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={16} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.predictLbl}>{label}</Text>
        <Text style={styles.predictVal}>{value}</Text>
      </View>
      {sub && <Text style={[styles.predictSub, { color }]}>{sub}</Text>}
    </View>
  );
}
function LegendDot({ color, label }: any) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  alertFertile: { flexDirection: "row", gap: 12, backgroundColor: "#F3E8FF", borderRadius: RADIUS.lg, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: "#A855F7" },
  alertIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#A855F7", alignItems: "center", justifyContent: "center" },
  alertTitle: { fontWeight: "800", color: "#6B21A8", fontSize: 15 },
  alertText: { color: "#6B21A8", fontSize: 13, marginTop: 4, marginBottom: 8 },
  alertRow: { flexDirection: "row", gap: 8 },
  alertChip: { backgroundColor: "rgba(255,255,255,0.6)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  alertChipLabel: { fontSize: 10, color: "#6B21A8" },
  alertChipValue: { fontSize: 14, fontWeight: "800", color: "#6B21A8" },
  predictCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  predictLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, letterSpacing: 1.5, marginBottom: 10 },
  predictRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  predictIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  predictLbl: { color: COLORS.textSecondary, fontSize: 11 },
  predictVal: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  predictSub: { fontSize: 12, fontWeight: "700" },
  statsCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  statsTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  statsGrid: { flexDirection: "row" },
  statItem: { flex: 1, alignItems: "center" },
  statItemMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 28, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, textTransform: "uppercase" },
  statsSub: { textAlign: "center", color: COLORS.textMuted, fontSize: 11, marginTop: 8 },
  calCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  calMonth: { fontWeight: "800", fontSize: 16, color: COLORS.textPrimary, textTransform: "capitalize" },
  dowRow: { flexDirection: "row", marginBottom: 6 },
  dow: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  gridDays: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  dayEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  dayInner: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dayNum: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "500" },
  dayRegles: { backgroundColor: "#E11D48" },
  dayPredit: { backgroundColor: "#FDA4B8" },
  dayFertile: { backgroundColor: "#FCD34D" },
  dayOvulation: { backgroundColor: "#10B981" },
  dayToday: { borderWidth: 2, borderColor: COLORS.primary },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 10, color: COLORS.textSecondary },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 15, marginBottom: 10, marginTop: 10 },
  empty: { color: COLORS.textMuted, textAlign: "center", fontStyle: "italic", paddingVertical: 16 },
  histCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  histIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  histTitle: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13, textTransform: "capitalize" },
  histMeta: { color: COLORS.textSecondary, fontSize: 12 },
  histNotes: { color: COLORS.textPrimary, fontSize: 12, marginTop: 2, fontStyle: "italic" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
