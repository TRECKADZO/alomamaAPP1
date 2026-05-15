import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const SYMPTOMES = ["nausées", "vomissements", "fatigue", "insomnie", "œdèmes", "crampes", "contractions Braxton-Hicks", "brûlures d'estomac", "constipation", "maux de dos", "vertiges"];

export default function SuiviMedical() {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [weightSeries, setWeightSeries] = useState<any[]>([]);
  const [tensionSeries, setTensionSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Form state
  const [poids, setPoids] = useState("");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [hu, setHu] = useState("");
  const [gly, setGly] = useState("");
  const [temp, setTemp] = useState("");
  const [mouv, setMouv] = useState("");
  const [notes, setNotes] = useState("");
  const [selSymp, setSelSymp] = useState<string[]>([]);
  const [lastAlerts, setLastAlerts] = useState<any[]>([]);

  const load = async () => {
    try {
      const r = await api.get("/grossesse-plus/tracking");
      setItems(r.data.items || []);
      setWeightSeries(r.data.weight_series || []);
      setTensionSeries(r.data.tension_series || []);
    } catch {} finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const toggleSymp = (s: string) => setSelSymp(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const submit = async () => {
    const payload: any = { symptomes: selSymp };
    if (poids) payload.poids_kg = parseFloat(poids);
    if (sys) payload.tension_sys = parseInt(sys);
    if (dia) payload.tension_dia = parseInt(dia);
    if (hu) payload.hauteur_uterine_cm = parseFloat(hu);
    if (gly) payload.glycemie = parseFloat(gly);
    if (temp) payload.temperature = parseFloat(temp);
    if (mouv) payload.mouvements_bb = parseInt(mouv);
    if (notes) payload.notes = notes;
    if (Object.keys(payload).length <= 1 && !selSymp.length) return Alert.alert("Saisie vide", "Saisissez au moins une mesure ou un symptôme.");
    try {
      setBusy(true);
      const r = await api.post("/grossesse-plus/tracking", payload);
      setLastAlerts(r.data.alerts || []);
      setPoids(""); setSys(""); setDia(""); setHu(""); setGly(""); setTemp(""); setMouv(""); setNotes(""); setSelSymp([]);
      await load();
      if ((r.data.alerts || []).length === 0) Alert.alert("✅ Enregistré", "Mesure ajoutée à votre suivi.");
    } catch (e) { Alert.alert("Erreur", formatError(e)); } finally { setBusy(false); }
  };

  const lastWeight = weightSeries[weightSeries.length - 1]?.value;
  const firstWeight = weightSeries[0]?.value;
  const gainTotal = (lastWeight && firstWeight) ? (lastWeight - firstWeight).toFixed(1) : null;

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
          {/* Stats globales */}
          <View style={s.statsBox}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{items.length}</Text>
              <Text style={s.statLabel}>Mesures</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{lastWeight ? `${lastWeight} kg` : "—"}</Text>
              <Text style={s.statLabel}>Poids actuel</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{gainTotal !== null ? `${gainTotal > 0 ? "+" : ""}${gainTotal} kg` : "—"}</Text>
              <Text style={s.statLabel}>Total pris</Text>
            </View>
          </View>

          {/* Alertes dernière mesure */}
          {lastAlerts.map((a, i) => (
            <View key={i} style={[s.alert, a.level === "critical" && s.alertCrit, a.level === "warning" && s.alertWarn]}>
              <Ionicons name="warning" size={20} color={a.level === "critical" ? "#DC2626" : "#F59E0B"} />
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>{a.title}</Text>
                <Text style={s.alertMsg}>{a.message}</Text>
              </View>
            </View>
          ))}

          {/* Formulaire saisie */}
          <Text style={s.title}>Nouvelle mesure</Text>
          <View style={s.formCard}>
            <View style={s.row}>
              <View style={s.col}>
                <Text style={s.label}>Poids (kg)</Text>
                <TextInput style={s.input} value={poids} onChangeText={setPoids} keyboardType="decimal-pad" placeholder="65.0" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={s.col}>
                <Text style={s.label}>Température (°C)</Text>
                <TextInput style={s.input} value={temp} onChangeText={setTemp} keyboardType="decimal-pad" placeholder="36.8" placeholderTextColor={COLORS.textMuted} />
              </View>
            </View>
            <View style={s.row}>
              <View style={s.col}>
                <Text style={s.label}>Tension (Syst.)</Text>
                <TextInput style={s.input} value={sys} onChangeText={setSys} keyboardType="number-pad" placeholder="120" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={s.col}>
                <Text style={s.label}>Tension (Diast.)</Text>
                <TextInput style={s.input} value={dia} onChangeText={setDia} keyboardType="number-pad" placeholder="80" placeholderTextColor={COLORS.textMuted} />
              </View>
            </View>
            <View style={s.row}>
              <View style={s.col}>
                <Text style={s.label}>Hauteur utérine (cm)</Text>
                <TextInput style={s.input} value={hu} onChangeText={setHu} keyboardType="decimal-pad" placeholder="20" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={s.col}>
                <Text style={s.label}>Glycémie (g/L)</Text>
                <TextInput style={s.input} value={gly} onChangeText={setGly} keyboardType="decimal-pad" placeholder="0.95" placeholderTextColor={COLORS.textMuted} />
              </View>
            </View>
            <Text style={s.label}>Mouvements du bébé (sur 2h)</Text>
            <TextInput style={s.input} value={mouv} onChangeText={setMouv} keyboardType="number-pad" placeholder="15" placeholderTextColor={COLORS.textMuted} />

            <Text style={[s.label, { marginTop: 16 }]}>Symptômes ressentis</Text>
            <View style={s.chipsWrap}>
              {SYMPTOMES.map(symp => (
                <TouchableOpacity key={symp} style={[s.chip, selSymp.includes(symp) && s.chipOn]} onPress={() => toggleSymp(symp)}>
                  <Text style={[s.chipTxt, selSymp.includes(symp) && s.chipTxtOn]}>{symp}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.label, { marginTop: 16 }]}>Notes</Text>
            <TextInput style={[s.input, { height: 70 }]} value={notes} onChangeText={setNotes} multiline placeholder="Observations personnelles..." placeholderTextColor={COLORS.textMuted} />

            <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={s.btnTxt}>{busy ? "Enregistrement..." : "Enregistrer cette mesure"}</Text>
            </TouchableOpacity>
          </View>

          {/* Historique */}
          {items.length > 0 && (
            <>
              <Text style={[s.title, { marginTop: 24 }]}>Historique</Text>
              {[...items].reverse().slice(0, 20).map(it => (
                <View key={it.id} style={s.histCard}>
                  <View style={s.histHead}>
                    <Text style={s.histWeek}>SA {it.week}</Text>
                    <Text style={s.histDate}>{new Date(it.created_at).toLocaleDateString("fr-FR")}</Text>
                  </View>
                  <View style={s.histGrid}>
                    {it.poids_kg && <Text style={s.histItem}>⚖️ {it.poids_kg} kg</Text>}
                    {it.tension_sys && <Text style={s.histItem}>❤️ {it.tension_sys}/{it.tension_dia}</Text>}
                    {it.hauteur_uterine_cm && <Text style={s.histItem}>📏 HU {it.hauteur_uterine_cm} cm</Text>}
                    {it.glycemie && <Text style={s.histItem}>🩸 {it.glycemie} g/L</Text>}
                    {it.temperature && <Text style={s.histItem}>🌡️ {it.temperature}°C</Text>}
                    {it.mouvements_bb && <Text style={s.histItem}>👶 {it.mouvements_bb} mvts</Text>}
                  </View>
                  {(it.symptomes || []).length > 0 && <Text style={s.histSymp}>{(it.symptomes || []).join(" • ")}</Text>}
                  {(it.alerts || []).map((a: any, i: number) => (
                    <View key={i} style={[s.miniAlert, a.level === "critical" && { backgroundColor: "#FEE2E2" }]}>
                      <Text style={[s.miniAlertTxt, a.level === "critical" && { color: "#B91C1C" }]}>⚠️ {a.title}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  statsBox: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 4, textTransform: "uppercase", fontWeight: "700" },
  alert: { flexDirection: "row", gap: 10, padding: 12, borderRadius: RADIUS.md, marginBottom: 10, backgroundColor: "#FEF3C7" },
  alertCrit: { backgroundColor: "#FEE2E2" },
  alertWarn: { backgroundColor: "#FEF3C7" },
  alertTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  alertMsg: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  title: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16, marginBottom: 10 },
  formCard: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, color: COLORS.textPrimary, fontWeight: "700", marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgPrimary },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTxt: { color: COLORS.textSecondary, fontSize: 12 },
  chipTxtOn: { color: "#fff", fontWeight: "700" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, padding: 14, borderRadius: RADIUS.pill, marginTop: 16 },
  btnTxt: { color: "#fff", fontWeight: "800" },
  histCard: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  histHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  histWeek: { fontWeight: "800", color: COLORS.primary, fontSize: 13 },
  histDate: { color: COLORS.textMuted, fontSize: 12 },
  histGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 4 },
  histItem: { color: COLORS.textPrimary, fontSize: 13 },
  histSymp: { color: COLORS.textSecondary, fontSize: 12, fontStyle: "italic", marginTop: 4 },
  miniAlert: { marginTop: 6, padding: 6, borderRadius: 6, backgroundColor: "#FEF3C7" },
  miniAlertTxt: { fontSize: 11, color: "#92400E", fontWeight: "700" },
});
