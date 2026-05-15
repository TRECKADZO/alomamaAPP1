import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { api, formatError } from "../../lib/api";
import { cachedGet, smartPost } from "../../lib/offline";
import VoiceQA from "../../components/VoiceQA";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const SYMPTOMES = ["nausées", "vomissements", "fatigue", "insomnie", "œdèmes", "crampes", "contractions Braxton-Hicks", "brûlures d'estomac", "constipation", "maux de dos", "vertiges", "essoufflement"];
// Question vocale dédiée à chaque symptôme (plus naturelle qu'un mot-clé seul)
const SYMPTOME_QUESTIONS: Record<string, string> = {
  "nausées": "Avez-vous des nausées en ce moment ?",
  "vomissements": "Avez-vous eu des vomissements ces derniers jours ?",
  "fatigue": "Vous sentez-vous très fatiguée ?",
  "insomnie": "Avez-vous du mal à dormir la nuit ?",
  "œdèmes": "Avez-vous les chevilles, mains ou visage gonflés ?",
  "crampes": "Avez-vous des crampes dans les jambes ?",
  "contractions Braxton-Hicks": "Avez-vous des contractions courtes et irrégulières (Braxton-Hicks) ?",
  "brûlures d'estomac": "Avez-vous des brûlures à l'estomac ou des remontées acides ?",
  "constipation": "Avez-vous des difficultés à aller à la selle ?",
  "maux de dos": "Avez-vous mal au dos ?",
  "vertiges": "Avez-vous des vertiges ou la tête qui tourne ?",
  "essoufflement": "Vous essoufflez-vous facilement, même au repos ?",
};
const CHART_W = Dimensions.get("window").width - 80;
const CHART_H = 160;

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
  // Mode vocal symptômes
  const [voiceModal, setVoiceModal] = useState(false);
  const [voiceIdx, setVoiceIdx] = useState(0);

  const load = async () => {
    try {
      const r = await cachedGet("/grossesse-plus/tracking");
      setItems(r.data.items || []);
      setWeightSeries(r.data.weight_series || []);
      setTensionSeries(r.data.tension_series || []);
    } catch {} finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const toggleSymp = (s: string) => setSelSymp(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  // Mode vocal : capture oui/non pour chaque symptôme
  const voiceAnswer = (val: "yes" | "no") => {
    const symp = SYMPTOMES[voiceIdx];
    setSelSymp(prev => {
      const has = prev.includes(symp);
      if (val === "yes" && !has) return [...prev, symp];
      if (val === "no" && has) return prev.filter(x => x !== symp);
      return prev;
    });
    setTimeout(() => {
      if (voiceIdx < SYMPTOMES.length - 1) {
        setVoiceIdx(voiceIdx + 1);
      } else {
        setVoiceModal(false);
        setVoiceIdx(0);
      }
    }, 300);
  };

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
      const r = await smartPost("/grossesse-plus/tracking", payload);
      setLastAlerts(r.data?.alerts || []);
      setPoids(""); setSys(""); setDia(""); setHu(""); setGly(""); setTemp(""); setMouv(""); setNotes(""); setSelSymp([]);
      await load();
      if (r.queued) Alert.alert("📡 Hors-ligne", "Votre mesure sera envoyée à la reconnexion.");
      else if ((r.data?.alerts || []).length === 0) Alert.alert("✅ Enregistré", "Mesure ajoutée à votre suivi.");
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

          {/* 📈 Courbe poids SVG */}
          {weightSeries.length >= 2 && (() => {
            const vals = weightSeries.map((x: any) => x.value).filter((v: any) => typeof v === "number");
            const minV = Math.floor(Math.min(...vals) - 2);
            const maxV = Math.ceil(Math.max(...vals) + 2);
            const range = Math.max(1, maxV - minV);
            const pts = weightSeries.map((x: any, i: number) => {
              const px = (i / Math.max(1, weightSeries.length - 1)) * CHART_W;
              const py = CHART_H - ((x.value - minV) / range) * CHART_H;
              return { px, py, v: x.value, w: x.week };
            });
            const polyline = pts.map(p => `${p.px},${p.py}`).join(" ");
            return (
              <View style={s.chartCard}>
                <Text style={s.chartTitle}>📈 Courbe de poids</Text>
                <Svg width={CHART_W} height={CHART_H + 20}>
                  {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                    <Line key={i} x1={0} y1={CHART_H * p} x2={CHART_W} y2={CHART_H * p} stroke={COLORS.border} strokeWidth={1} strokeDasharray={i === 0 || i === 4 ? "" : "3 3"} />
                  ))}
                  <Polyline points={polyline} fill="none" stroke={COLORS.primary} strokeWidth={3} />
                  {pts.map((p, i) => (
                    <Circle key={i} cx={p.px} cy={p.py} r={4} fill={COLORS.primary} />
                  ))}
                  <SvgText x={4} y={12} fontSize={10} fill={COLORS.textMuted}>{maxV} kg</SvgText>
                  <SvgText x={4} y={CHART_H} fontSize={10} fill={COLORS.textMuted}>{minV} kg</SvgText>
                </Svg>
                <Text style={s.chartSub}>{weightSeries.length} mesures · de SA {weightSeries[0].week} à SA {weightSeries[weightSeries.length-1].week}</Text>
              </View>
            );
          })()}

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
            <TouchableOpacity style={s.voiceModeBtn} onPress={() => { setVoiceIdx(0); setVoiceModal(true); }}>
              <Ionicons name="mic" size={16} color="#fff" />
              <Text style={s.voiceModeTxt}>Mode vocal — répondre oui/non à chaque symptôme</Text>
            </TouchableOpacity>
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

      {/* Modal mode vocal symptômes */}
      <Modal visible={voiceModal} animationType="slide" transparent onRequestClose={() => setVoiceModal(false)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Mode vocal — Symptômes</Text>
              <TouchableOpacity onPress={() => { setVoiceModal(false); setVoiceIdx(0); }}>
                <Ionicons name="close" size={26} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={s.voiceProgress}>
              <View style={[s.voiceProgressFill, { width: `${((voiceIdx + 1) / SYMPTOMES.length) * 100}%` }]} />
            </View>
            <Text style={s.voiceCount}>Symptôme {voiceIdx + 1} / {SYMPTOMES.length}</Text>
            <Text style={s.voiceSymp}>{SYMPTOMES[voiceIdx]}</Text>
            <Text style={s.voiceQuestion}>{SYMPTOME_QUESTIONS[SYMPTOMES[voiceIdx]] || `Avez-vous ce symptôme : ${SYMPTOMES[voiceIdx]} ?`}</Text>

            <View style={{ alignItems: "center", marginVertical: 14 }}>
              <VoiceQA
                key={`vs-${voiceIdx}`}
                question={SYMPTOME_QUESTIONS[SYMPTOMES[voiceIdx]] || `Avez-vous ${SYMPTOMES[voiceIdx]} ?`}
                prefix={`Symptôme ${voiceIdx + 1} sur ${SYMPTOMES.length}`}
                autoRead
                onYes={() => voiceAnswer("yes")}
                onNo={() => voiceAnswer("no")}
                color={COLORS.primary}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[s.voiceBtn, { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }]} onPress={() => voiceAnswer("no")}>
                <Ionicons name="close-circle" size={24} color="#DC2626" />
                <Text style={[s.voiceBtnTxt, { color: "#DC2626" }]}>NON</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.voiceBtn, { backgroundColor: "#D1FAE5", borderColor: "#16A34A" }]} onPress={() => voiceAnswer("yes")}>
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                <Text style={[s.voiceBtnTxt, { color: "#16A34A" }]}>OUI</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.voiceHint}>
              {selSymp.length > 0 ? `✓ ${selSymp.length} symptôme${selSymp.length > 1 ? "s" : ""} coché${selSymp.length > 1 ? "s" : ""}` : "Aucun symptôme coché"}
            </Text>
          </View>
        </View>
      </Modal>
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
  chartCard: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  chartTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, fontSize: 14 },
  chartSub: { color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginTop: 6 },
  voiceModeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, marginBottom: 10 },
  voiceModeTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderRadius: RADIUS.lg, padding: SPACING.lg },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  voiceProgress: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: "hidden", marginBottom: 8 },
  voiceProgressFill: { height: "100%", backgroundColor: COLORS.primary },
  voiceCount: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 },
  voiceSymp: { fontSize: 20, fontWeight: "800", color: COLORS.primary, marginBottom: 6 },
  voiceQuestion: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 19 },
  voiceBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 2 },
  voiceBtnTxt: { fontWeight: "800", fontSize: 15 },
  voiceHint: { textAlign: "center", color: COLORS.textMuted, fontSize: 12, marginTop: 12, fontStyle: "italic" },
});
