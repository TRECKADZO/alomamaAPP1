import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Contractions() {
  const [items, setItems] = useState<any[]>([]);
  const [advice, setAdvice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<any>(null);

  const load = async () => {
    try {
      const r = await api.get("/grossesse-plus/contractions");
      setItems(r.data.items || []);
      setAdvice(r.data.advice);
    } catch {} finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  useEffect(() => {
    if (running && startTime) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, startTime]);

  const startCtx = () => {
    setStartTime(Date.now());
    setElapsed(0);
    setRunning(true);
  };

  const stopCtx = async (intensity: "faible" | "moyenne" | "forte") => {
    if (!startTime) return;
    setRunning(false);
    const startedAt = new Date(startTime).toISOString();
    const endedAt = new Date().toISOString();
    try {
      await api.post("/grossesse-plus/contractions", { started_at: startedAt, ended_at: endedAt, intensity });
      setStartTime(null);
      setElapsed(0);
      await load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const remove = (id: string) => {
    Alert.alert("Supprimer cette contraction ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => { try { await api.delete(`/grossesse-plus/contractions/${id}`); load(); } catch {} } },
    ]);
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const fmt = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const r = (sec % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  // Calcul intervalles
  const recent = items.slice(0, 6).reverse();
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    try {
      const a = new Date(recent[i - 1].started_at).getTime();
      const b = new Date(recent[i].started_at).getTime();
      intervals.push(Math.round((b - a) / 60000));
    } catch {}
  }

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {advice && (
          <View style={[s.advice, advice.level === "critical" && s.adviceCrit, advice.level === "warning" && s.adviceWarn]}>
            <Ionicons name={advice.level === "critical" ? "alert-circle" : "information-circle"} size={24} color={advice.level === "critical" ? "#fff" : advice.level === "warning" ? "#92400E" : COLORS.textPrimary} />
            <Text style={[s.adviceTxt, advice.level === "critical" && { color: "#fff" }, advice.level === "warning" && { color: "#92400E" }]}>{advice.message}</Text>
          </View>
        )}

        <View style={s.timerCard}>
          <Text style={s.timerLabel}>{running ? "CONTRACTION EN COURS" : "Prêt à chronométrer"}</Text>
          <Text style={[s.timer, running && { color: COLORS.error }]}>{fmt(elapsed)}</Text>
          {!running ? (
            <TouchableOpacity style={[s.bigBtn, { backgroundColor: COLORS.primary }]} onPress={startCtx}>
              <Ionicons name="play" size={28} color="#fff" />
              <Text style={s.bigBtnTxt}>Démarrer</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.intensityRow}>
              <Text style={s.intensityTitle}>Intensité ressentie ?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={[s.intBtn, { backgroundColor: "#FEF3C7" }]} onPress={() => stopCtx("faible")}>
                  <Text style={[s.intTxt, { color: "#92400E" }]}>Faible</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.intBtn, { backgroundColor: "#FED7AA" }]} onPress={() => stopCtx("moyenne")}>
                  <Text style={[s.intTxt, { color: "#9A3412" }]}>Moyenne</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.intBtn, { backgroundColor: "#FECACA" }]} onPress={() => stopCtx("forte")}>
                  <Text style={[s.intTxt, { color: "#991B1B" }]}>Forte</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {intervals.length > 0 && (
          <View style={s.intervalsCard}>
            <Text style={s.cardTitle}>Intervalles récents</Text>
            <View style={s.intRow}>
              {intervals.map((v, i) => (
                <View key={i} style={s.intBubble}>
                  <Text style={s.intVal}>{v}</Text>
                  <Text style={s.intLbl}>min</Text>
                </View>
              ))}
            </View>
            <Text style={s.intHelp}>✨ Au-delà de 5 contractions régulières en moins de 5 minutes → rendez-vous à la maternité.</Text>
          </View>
        )}

        {items.length > 0 && (
          <>
            <Text style={s.title}>Historique récent</Text>
            {items.slice(0, 30).map(it => (
              <View key={it.id} style={s.histCard}>
                <View>
                  <Text style={s.histTime}>{new Date(it.started_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
                  <Text style={s.histMeta}>{it.duration_sec ? `${it.duration_sec}s • ` : ""}{it.intensity}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(it.id)}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  advice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: RADIUS.md, marginBottom: 14, alignItems: "center", backgroundColor: COLORS.bgSecondary },
  adviceCrit: { backgroundColor: "#DC2626" },
  adviceWarn: { backgroundColor: "#FEF3C7" },
  adviceTxt: { flex: 1, color: COLORS.textPrimary, fontWeight: "700", lineHeight: 19 },
  timerCard: { padding: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", marginBottom: 16 },
  timerLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1.5 },
  timer: { fontSize: 60, fontWeight: "800", color: COLORS.textPrimary, fontVariant: ["tabular-nums"], marginVertical: 12 },
  bigBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16, paddingHorizontal: 36, borderRadius: RADIUS.pill },
  bigBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  intensityRow: { alignItems: "center", gap: 10 },
  intensityTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  intBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: RADIUS.md, alignItems: "center" },
  intTxt: { fontWeight: "800" },
  intervalsCard: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  intRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  intBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  intVal: { color: COLORS.primary, fontWeight: "800", fontSize: 16 },
  intLbl: { color: COLORS.primary, fontSize: 10 },
  intHelp: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic", lineHeight: 16 },
  title: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16, marginBottom: 10 },
  histCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  histTime: { color: COLORS.textPrimary, fontWeight: "700" },
  histMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
});
