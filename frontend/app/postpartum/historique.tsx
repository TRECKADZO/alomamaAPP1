import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Polyline, Circle, Line, Text as SvgText } from "react-native-svg";
import { Dimensions } from "react-native";
import { cachedGet, smartDelete } from "../../lib/offline";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const CHART_W = Dimensions.get("window").width - 80;
const CHART_H = 120;
const MOOD_EMOJI: Record<number,string> = {1:"😭",2:"😟",3:"😐",4:"😊",5:"😄"};

export default function Historique() {
  const [items, setItems] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await cachedGet("/postpartum/checkins");
      setItems(r.data.items || []);
      setSeries(r.data.mood_series || []);
    } catch {}
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const remove = (id: string) => {
    Alert.alert("Supprimer ce check-in ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => { try { await smartDelete(`/postpartum/checkin/${id}`); load(); } catch {} } },
    ]);
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" /></SafeAreaView>;

  // Courbe mood
  const polyline = series.length >= 2 ? series.map((x, i) => {
    const px = (i / Math.max(1, series.length - 1)) * CHART_W;
    const py = CHART_H - ((x.mood - 1) / 4) * CHART_H;
    return `${px},${py}`;
  }).join(" ") : "";

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {series.length >= 2 && (
          <View style={s.chartCard}>
            <Text style={s.chartTitle}>📈 Évolution de votre humeur</Text>
            <Svg width={CHART_W} height={CHART_H + 20}>
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
                <Line key={i} x1={0} y1={CHART_H * p} x2={CHART_W} y2={CHART_H * p} stroke={COLORS.border} strokeWidth={1} strokeDasharray="3 3" />
              ))}
              <Polyline points={polyline} fill="none" stroke="#EC4899" strokeWidth={3} />
              {series.map((x, i) => {
                const px = (i / Math.max(1, series.length - 1)) * CHART_W;
                const py = CHART_H - ((x.mood - 1) / 4) * CHART_H;
                return <Circle key={i} cx={px} cy={py} r={5} fill="#EC4899" />;
              })}
              <SvgText x={4} y={12} fontSize={10} fill={COLORS.textMuted}>😄</SvgText>
              <SvgText x={4} y={CHART_H} fontSize={10} fill={COLORS.textMuted}>😭</SvgText>
            </Svg>
            <Text style={s.chartSub}>{series.length} check-ins · dernière semaine SA {series[series.length-1]?.week}</Text>
          </View>
        )}

        {items.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 50 }}>🌸</Text>
            <Text style={s.emptyTitle}>Aucun check-in encore</Text>
            <Text style={s.emptyTxt}>Faites votre premier check-in pour suivre votre évolution.</Text>
          </View>
        ) : items.map(it => (
          <View key={it.id} style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardEmoji}>{MOOD_EMOJI[it.mood]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cardDate}>SA {it.week_pp} · {new Date(it.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</Text>
                <Text style={s.cardMeta}>
                  {it.physical_symptoms?.length || 0} sympt. physiques · {it.mental_symptoms?.length || 0} émotionnels
                </Text>
              </View>
              <TouchableOpacity onPress={() => remove(it.id)}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
            {it.free_text ? <Text style={s.cardText} numberOfLines={3}>« {it.free_text} »</Text> : null}
            {(it.alerts || []).map((a: any, i: number) => (
              <View key={i} style={[s.alert, a.level === "critical" && { backgroundColor: "#FEE2E2" }]}>
                <Text style={[s.alertTxt, a.level === "critical" && { color: "#B91C1C" }]}>
                  {a.level === "critical" ? "🚨 " : "⚠️ "}{a.title}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FDF2F8" },
  chartCard: { padding: SPACING.lg, backgroundColor: "#fff", borderRadius: RADIUS.lg, marginBottom: 14 },
  chartTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  chartSub: { color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginTop: 6 },
  empty: { padding: SPACING.xl, backgroundColor: "#fff", borderRadius: RADIUS.lg, alignItems: "center" },
  emptyTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16, marginTop: 12 },
  emptyTxt: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
  card: { padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.md, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardEmoji: { fontSize: 32 },
  cardDate: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  cardText: { color: COLORS.textPrimary, fontStyle: "italic", marginTop: 10, lineHeight: 19, fontSize: 13 },
  alert: { padding: 8, backgroundColor: "#FEF3C7", borderRadius: 6, marginTop: 8 },
  alertTxt: { color: "#92400E", fontWeight: "700", fontSize: 11 },
});
