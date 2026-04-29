/**
 * MiniGrowthChart — mini courbe SVG poids/taille en fonction de l'âge
 * Usage compact (160px hauteur) pour aperçu sur le carnet de l'enfant.
 */
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop } from "react-native-svg";
import { COLORS, RADIUS } from "../constants/theme";

type Mesure = { date: string; poids_kg?: number; taille_cm?: number };
type Props = {
  date_naissance: string;
  mesures: Mesure[];
  initialPoids?: number;
  initialTaille?: number;
  /** Mesure courante (poids actuel) injectée comme dernier point si pas dans mesures */
  poids_actuel?: number;
  taille_actuel?: number;
  /** Callback "Voir les courbes OMS détaillées" */
  onPressDetails?: () => void;
};

function ageMoisAt(dn: string, dateMesure: string): number {
  const ms = new Date(dateMesure).getTime() - new Date(dn).getTime();
  return Math.max(0, ms / (30.44 * 86400000));
}

export default function MiniGrowthChart({
  date_naissance,
  mesures,
  initialPoids,
  initialTaille,
  poids_actuel,
  taille_actuel,
  onPressDetails,
}: Props) {
  const [tab, setTab] = useState<"poids" | "taille">("poids");

  // Construit les points (âge en mois → valeur)
  const points = useMemo(() => {
    const all: { ageM: number; val: number; date: string }[] = [];

    // Mesure de naissance
    if (initialPoids != null && tab === "poids") all.push({ ageM: 0, val: initialPoids, date: date_naissance });
    if (initialTaille != null && tab === "taille") all.push({ ageM: 0, val: initialTaille, date: date_naissance });

    // Mesures historiques
    for (const m of mesures || []) {
      const v = tab === "poids" ? m.poids_kg : m.taille_cm;
      if (v != null && m.date) {
        all.push({ ageM: ageMoisAt(date_naissance, m.date), val: v, date: m.date });
      }
    }

    // Mesure courante (au cas où elle ne figure pas dans mesures[])
    const cur = tab === "poids" ? poids_actuel : taille_actuel;
    if (cur != null) {
      const today = new Date().toISOString().split("T")[0];
      const exists = all.some((p) => Math.abs(p.ageM - ageMoisAt(date_naissance, today)) < 0.5);
      if (!exists) {
        all.push({ ageM: ageMoisAt(date_naissance, today), val: cur, date: today });
      }
    }

    return all.sort((a, b) => a.ageM - b.ageM);
  }, [tab, mesures, initialPoids, initialTaille, poids_actuel, taille_actuel, date_naissance]);

  const W = Math.min(Dimensions.get("window").width - 60, 360);
  const H = 160;
  const PAD_L = 32, PAD_R = 12, PAD_T = 14, PAD_B = 28;

  if (points.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.tabsRow}>
          {(["poids", "taille"] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "poids" ? "⚖️ Poids" : "📏 Taille"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Pas encore de mesures enregistrées</Text>
          <Text style={styles.emptySub}>Ajoutez la première mesure pour voir la courbe.</Text>
        </View>
      </View>
    );
  }

  // Calcul échelles
  const maxAge = Math.max(...points.map((p) => p.ageM), 6);
  const xMax = Math.ceil(maxAge / 6) * 6 || 6; // arrondi multiples de 6 mois
  const vals = points.map((p) => p.val);
  const minY = Math.min(...vals) * 0.9;
  const maxY = Math.max(...vals) * 1.1;
  const fx = (a: number) => PAD_L + (a / xMax) * (W - PAD_L - PAD_R);
  const fy = (v: number) => H - PAD_B - ((v - minY) / (maxY - minY || 1)) * (H - PAD_T - PAD_B);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${fx(p.ageM)} ${fy(p.val)}`).join(" ");
  const areaPath = `${path} L ${fx(points[points.length - 1].ageM)} ${H - PAD_B} L ${fx(points[0].ageM)} ${H - PAD_B} Z`;

  const color = tab === "poids" ? "#06B6D4" : "#A855F7";
  const lastPoint = points[points.length - 1];
  const unit = tab === "poids" ? "kg" : "cm";

  // Y-axis ticks (4 lignes)
  const yTicks = [0, 0.33, 0.66, 1].map((r) => minY + (maxY - minY) * r);
  const xTicks = Array.from({ length: Math.min(5, xMax / 6 + 1) }, (_, i) => Math.round((i * xMax) / Math.max(1, Math.min(4, xMax / 6))));

  return (
    <View style={styles.card}>
      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(["poids", "taille"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "poids" ? "⚖️ Poids" : "📏 Taille"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id={`grad-${tab}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.35" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Y grid */}
        {yTicks.map((y, i) => (
          <Line key={`y-${i}`} x1={PAD_L} y1={fy(y)} x2={W - PAD_R} y2={fy(y)} stroke="#E5E7EB" strokeWidth={i === 0 ? 1.5 : 0.5} />
        ))}

        {/* Y labels */}
        {yTicks.map((y, i) => (
          <SvgText key={`yl-${i}`} x={PAD_L - 6} y={fy(y) + 3} fontSize="9" fill="#9CA3AF" textAnchor="end">{y.toFixed(1)}</SvgText>
        ))}

        {/* X labels (mois) */}
        {xTicks.map((x, i) => (
          <SvgText key={`xl-${i}`} x={fx(x)} y={H - 8} fontSize="9" fill="#9CA3AF" textAnchor="middle">{x}m</SvgText>
        ))}

        {/* Aire dégradée */}
        {points.length > 1 && <Path d={areaPath} fill={`url(#grad-${tab})`} />}

        {/* Courbe */}
        {points.length > 1 && <Path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}

        {/* Points */}
        {points.map((p, i) => (
          <Circle key={i} cx={fx(p.ageM)} cy={fy(p.val)} r={i === points.length - 1 ? 5 : 3.5} fill="#fff" stroke={color} strokeWidth={2} />
        ))}

        {/* Valeur dernière mesure */}
        {lastPoint && (
          <SvgText x={fx(lastPoint.ageM)} y={fy(lastPoint.val) - 10} fontSize="11" fontWeight="bold" fill={color} textAnchor="middle">
            {lastPoint.val.toFixed(1)} {unit}
          </SvgText>
        )}
      </Svg>

      {/* Footer info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {points.length} mesure{points.length > 1 ? "s" : ""} · dernière à {Math.round(lastPoint.ageM)} mois
        </Text>
        {onPressDetails && (
          <TouchableOpacity onPress={onPressDetails}>
            <Text style={styles.detailsLink}>Courbes OMS →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginVertical: 6 },
  tabsRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 6, alignItems: "center", borderRadius: RADIUS.pill, backgroundColor: COLORS.bgPrimary, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: "#fff" },
  empty: { alignItems: "center", paddingVertical: 30 },
  emptyText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "700" },
  emptySub: { color: COLORS.textMuted, fontSize: 11, marginTop: 4, textAlign: "center" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  footerText: { fontSize: 10, color: COLORS.textMuted, fontStyle: "italic" },
  detailsLink: { fontSize: 11, color: COLORS.primary, fontWeight: "800" },
});
