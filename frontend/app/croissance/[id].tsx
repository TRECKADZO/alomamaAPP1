import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Line, Path, Circle, Text as SvgText, Rect } from "react-native-svg";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const CLASSIF_COLORS: Record<string, string> = {
  tres_bas: "#DC2626",
  bas: "#F59E0B",
  normal: "#10B981",
  eleve: "#F59E0B",
  tres_eleve: "#DC2626",
};
const CLASSIF_LABEL: Record<string, string> = {
  tres_bas: "Très bas",
  bas: "Bas",
  normal: "Normal",
  eleve: "Élevé",
  tres_eleve: "Très élevé",
};

export default function Croissance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"poids" | "taille">("poids");

  useEffect(() => { (async () => {
    try {
      const r = await api.get(`/enfants/${id}/croissance-oms`);
      setData(r.data);
    } finally { setLoading(false); }
  })(); }, [id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.center}><Text>Pas de données</Text></SafeAreaView>;

  const enfant = data.enfant || {};
  const points = data.points || [];
  const refs = tab === "poids" ? data.reference_poids_age : data.reference_taille_age;
  const unit = tab === "poids" ? "kg" : "cm";
  const keyY = tab === "poids" ? "poids_kg" : "taille_cm";
  const keyClass = tab === "poids" ? "classification_poids" : "classification_taille";

  // Scale
  const W = Math.min(Dimensions.get("window").width - 32, 500);
  const H = 260;
  const PAD_L = 36, PAD_R = 12, PAD_T = 18, PAD_B = 28;
  const maxX = 60;
  const allY = refs.flatMap((r: any) => [r.p3, r.p97]).concat(points.map((p: any) => p[keyY] || 0));
  const maxY = Math.max(...allY) * 1.05;
  const minY = Math.min(...allY.filter((v: number) => v > 0)) * 0.9;
  const fx = (x: number) => PAD_L + (x / maxX) * (W - PAD_L - PAD_R);
  const fy = (y: number) => H - PAD_B - ((y - minY) / (maxY - minY)) * (H - PAD_T - PAD_B);

  const buildPath = (key: string) => {
    let d = "";
    refs.forEach((r: any, i: number) => {
      d += (i === 0 ? "M" : "L") + fx(r.mois) + "," + fy(r[key]);
    });
    return d;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Courbes OMS — {enfant.nom}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <View style={styles.infoCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoName}>{enfant.nom}</Text>
            <Text style={styles.infoMeta}>{enfant.sexe === "F" ? "👧 Fille" : "👦 Garçon"} · né(e) le {enfant.date_naissance?.slice(0, 10)}</Text>
            {enfant.numero_cmu ? (
              <View style={styles.cmuRow}>
                <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
                <Text style={styles.cmuText}>N° CMU : {enfant.numero_cmu}</Text>
              </View>
            ) : (
              <Text style={styles.cmuMiss}>N° CMU non renseigné</Text>
            )}
          </View>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === "poids" && styles.tabActive]} onPress={() => setTab("poids")}>
            <Ionicons name="scale" size={14} color={tab === "poids" ? "#fff" : COLORS.textSecondary} />
            <Text style={[styles.tabText, tab === "poids" && { color: "#fff" }]}>Poids / Âge</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === "taille" && styles.tabActive]} onPress={() => setTab("taille")}>
            <Ionicons name="resize" size={14} color={tab === "taille" ? "#fff" : COLORS.textSecondary} />
            <Text style={[styles.tabText, tab === "taille" && { color: "#fff" }]}>Taille / Âge</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartCard}>
          <Svg width={W} height={H}>
            {/* Grid horizontal */}
            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
              const y = PAD_T + r * (H - PAD_T - PAD_B);
              const val = maxY - r * (maxY - minY);
              return (
                <React.Fragment key={i}>
                  <Line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#E5E7EB" strokeWidth={0.5} />
                  <SvgText x={PAD_L - 4} y={y + 3} fontSize="9" fill="#6B7280" textAnchor="end">{val.toFixed(1)}</SvgText>
                </React.Fragment>
              );
            })}
            {/* Axes labels months */}
            {[0, 6, 12, 24, 36, 48, 60].map((m) => (
              <SvgText key={m} x={fx(m)} y={H - PAD_B + 14} fontSize="9" fill="#6B7280" textAnchor="middle">{m}mo</SvgText>
            ))}
            {/* Bands : P3-P15 (jaune clair), P15-P85 (vert clair normal), P85-P97 (jaune clair), P3 & P97 (rouge clair) */}
            <Path d={buildPath("p97") + " L " + fx(60) + "," + fy(0) + " L " + fx(0) + "," + fy(0) + " Z"} fill="#FEE2E2" opacity={0.3} />
            <Path d={buildPath("p3") + " L " + fx(60) + "," + fy(0) + " L " + fx(0) + "," + fy(0) + " Z"} fill="#FFFFFF" />
            {/* Lines */}
            <Path d={buildPath("p3")} stroke="#DC2626" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            <Path d={buildPath("p15")} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            <Path d={buildPath("p50")} stroke="#10B981" strokeWidth={1.8} fill="none" />
            <Path d={buildPath("p85")} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            <Path d={buildPath("p97")} stroke="#DC2626" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            {/* Child points */}
            {points.filter((p: any) => p[keyY]).map((p: any, i: number) => (
              <Circle key={i} cx={fx(p.age_mois)} cy={fy(p[keyY])} r={5} fill="#6366F1" stroke="#fff" strokeWidth={1.5} />
            ))}
          </Svg>

          <View style={styles.legend}>
            <Legend color="#10B981" label="P50 (médiane OMS)" solid />
            <Legend color="#F59E0B" label="P15-P85 (normal)" />
            <Legend color="#DC2626" label="P3/P97 (extrême)" />
            <Legend color="#6366F1" label={enfant.nom} dot />
          </View>
        </View>

        {/* Points list */}
        <Text style={styles.h2}>Historique des mesures</Text>
        {points.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyTxt}>Aucune mesure enregistrée. Ajoutez-en depuis la fiche enfant.</Text></View>
        ) : (
          points.filter((p: any) => p[keyY]).map((p: any, i: number) => (
            <View key={i} style={styles.ptRow}>
              <View style={styles.ptLeft}>
                <Text style={styles.ptAge}>{Math.round(p.age_mois)}m</Text>
                <Text style={styles.ptDate}>{p.date?.slice(0, 10)}</Text>
              </View>
              <Text style={styles.ptVal}>{p[keyY]} {unit}</Text>
              {p[keyClass] && (
                <View style={[styles.classifBadge, { backgroundColor: CLASSIF_COLORS[p[keyClass]] + "22" }]}>
                  <Text style={[styles.classifText, { color: CLASSIF_COLORS[p[keyClass]] }]}>
                    {CLASSIF_LABEL[p[keyClass]]}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        <Text style={styles.source}>📊 {data.source}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Stub React import for fragments
import React from "react";

function Legend({ color, label, solid, dot }: { color: string; label: string; solid?: boolean; dot?: boolean }) {
  return (
    <View style={styles.legItem}>
      {dot ? (
        <View style={[styles.legDot, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legLine, { backgroundColor: color, opacity: solid ? 1 : 0.7 }]} />
      )}
      <Text style={styles.legText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },

  infoCard: { flexDirection: "row", padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  infoName: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  infoMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cmuRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  cmuText: { fontSize: 12, fontWeight: "700", color: "#16A34A" },
  cmuMiss: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontStyle: "italic" },

  tabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },

  chartCard: { padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", marginBottom: 14 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 8 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legLine: { width: 18, height: 2 },
  legDot: { width: 9, height: 9, borderRadius: 5 },
  legText: { fontSize: 10, color: COLORS.textSecondary },

  h2: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4, marginBottom: 8 },
  ptRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  ptLeft: { width: 70 },
  ptAge: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  ptDate: { fontSize: 10, color: COLORS.textMuted },
  ptVal: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  classifBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  classifText: { fontSize: 10, fontWeight: "800" },

  empty: { padding: 14, alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md },
  emptyTxt: { color: COLORS.textMuted, fontSize: 12, textAlign: "center" },
  source: { fontSize: 10, color: COLORS.textMuted, textAlign: "center", marginTop: 18, fontStyle: "italic" },
});
