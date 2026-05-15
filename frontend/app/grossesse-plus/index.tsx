import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const TRIM_BG = ["#FCE7F3", "#EDE9FE", "#DBEAFE"];
const TRIM_COLOR = ["#EC4899", "#8B5CF6", "#3B82F6"];
const TRIM_TITLE = ["1er trimestre", "2e trimestre", "3e trimestre"];

export default function GrossessePlusHome() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code?: number; msg: string } | null>(null);

  const load = async () => {
    try {
      setErr(null);
      const r = await api.get("/grossesse-plus/dashboard");
      setData(r.data);
    } catch (e: any) {
      const code = e?.response?.status;
      setErr({ code, msg: formatError(e) });
      setData(null);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  if (loading) {
    return (
      <SafeAreaView style={styles.loader}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Non-premium
  if (err?.code === 402) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeEmoji}>🤰💎</Text>
            <Text style={styles.upgradeTitle}>Grossesse +</Text>
            <Text style={styles.upgradeSub}>L'expérience premium pour vivre chaque semaine de votre grossesse</Text>
            <View style={styles.featList}>
              {[
                { i: "calendar", t: "Suivi semaine par semaine (4 à 41 SA)" },
                { i: "pulse", t: "Suivi médical : poids, tension, glycémie" },
                { i: "warning", t: "Alertes intelligentes (pré-éclampsie, paludisme)" },
                { i: "book", t: "Journal de grossesse + photos d'échographies" },
                { i: "timer", t: "Compteur de contractions intelligent" },
                { i: "bag", t: "Trousseau maternité personnalisé" },
                { i: "heart", t: "Exercices de respiration et préparation mentale" },
              ].map((f, i) => (
                <View key={i} style={styles.featRow}>
                  <Ionicons name={f.i as any} size={18} color={COLORS.primary} />
                  <Text style={styles.featText}>{f.t}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.cta} onPress={() => router.push("/premium")}>
              <Ionicons name="diamond" size={18} color="#fff" />
              <Text style={styles.ctaText}>Passer Premium - 5 000 F/mois</Text>
            </TouchableOpacity>
            <Text style={styles.disclaimer}>Ces informations ne remplacent pas un avis médical professionnel.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Aucune grossesse active
  if (err?.code === 404) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.emptyCard}>
            <Text style={styles.upgradeEmoji}>🤰</Text>
            <Text style={styles.emptyTitle}>Configurez votre grossesse</Text>
            <Text style={styles.emptyText}>Renseignez la date de vos dernières règles (DDR) ou votre date prévue d'accouchement (DPA) pour démarrer votre suivi personnalisé.</Text>
            <TouchableOpacity style={styles.cta} onPress={() => router.push("/grossesse-plus/setup")}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.ctaText}>Démarrer ma grossesse</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (err) {
    return (
      <SafeAreaView style={styles.loader}>
        <Text style={{ color: COLORS.textSecondary }}>{err.msg}</Text>
        <TouchableOpacity style={[styles.cta, { marginTop: 20 }]} onPress={load}>
          <Text style={styles.ctaText}>Réessayer</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const t = (data?.trimester || 1) - 1;
  const trimColor = TRIM_COLOR[t];
  const trimBg = TRIM_BG[t];
  const dpaDate = new Date(data.dpa);
  const dpaLabel = dpaDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const fiche = data.current_week_content || {};

  const tools = [
    { id: "semaines", label: "Toutes les semaines", icon: "calendar", color: "#8B5CF6", nav: "/grossesse-plus/semaines" },
    { id: "suivi", label: "Suivi médical", icon: "pulse", color: "#EC4899", nav: "/grossesse-plus/suivi" },
    { id: "journal", label: "Mon journal", icon: "book", color: "#10B981", nav: "/grossesse-plus/journal" },
    { id: "contractions", label: "Contractions", icon: "timer", color: "#F59E0B", nav: "/grossesse-plus/contractions" },
    { id: "trousseau", label: "Trousseau", icon: "bag", color: "#06B6D4", nav: "/grossesse-plus/trousseau" },
    { id: "respiration", label: "Respiration", icon: "heart", color: "#E11D48", nav: "/grossesse-plus/respiration" },
    { id: "cpn", label: "Consultations", icon: "medkit", color: "#14B8A6", nav: "/grossesse-plus/cpn" },
    { id: "naissance", label: "Déclarer naissance", icon: "happy", color: "#A855F7", nav: "/grossesse-plus/naissance" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* HERO */}
        <View style={[styles.hero, { backgroundColor: trimColor }]}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTrim}>{TRIM_TITLE[t].toUpperCase()}</Text>
              <Text style={styles.heroWeeks}>{data.weeks} <Text style={styles.heroWeeksUnit}>SA</Text></Text>
              <Text style={styles.heroDays}>+ {data.days} jour{data.days > 1 ? "s" : ""}</Text>
            </View>
            <View style={styles.heroRing}>
              <Text style={styles.heroRingValue}>{data.progression_pct}%</Text>
              <Text style={styles.heroRingLabel}>parcouru</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${data.progression_pct}%` }]} />
          </View>
          <View style={styles.heroBottom}>
            <View>
              <Text style={styles.heroLabel}>DATE PRÉVUE</Text>
              <Text style={styles.heroVal}>{dpaLabel}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.heroLabel}>DANS</Text>
              <Text style={styles.heroVal}>{data.days_to_dpa} jours</Text>
            </View>
          </View>
        </View>

        {/* Cette semaine */}
        {fiche.fruit && (
          <TouchableOpacity style={styles.weekCard} onPress={() => router.push(`/grossesse-plus/semaine/${fiche.week}` as any)}>
            <View style={[styles.weekIcon, { backgroundColor: trimBg }]}>
              <Text style={{ fontSize: 38 }}>{fiche.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.weekLbl}>CETTE SEMAINE • SA {fiche.week}</Text>
              <Text style={styles.weekFruit}>Taille d'un{fiche.fruit?.startsWith("a")||fiche.fruit?.startsWith("e")||fiche.fruit?.startsWith("é") ? "" : "e"} {fiche.fruit}</Text>
              <View style={styles.weekStats}>
                <Text style={styles.weekStat}>📏 {fiche.size_cm} cm</Text>
                <Text style={styles.weekStat}>⚖️ {fiche.weight_g >= 1000 ? `${(fiche.weight_g/1000).toFixed(2)} kg` : `${fiche.weight_g} g`}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        {/* CTA Suivi rapide */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.quickAction, { backgroundColor: "#FCE7F3" }]} onPress={() => router.push("/grossesse-plus/suivi")}>
            <Ionicons name="add-circle" size={24} color="#EC4899" />
            <Text style={[styles.quickTxt, { color: "#EC4899" }]}>Saisir mesure</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickAction, { backgroundColor: "#FEF3C7" }]} onPress={() => router.push("/grossesse-plus/contractions")}>
            <Ionicons name="timer" size={24} color="#F59E0B" />
            <Text style={[styles.quickTxt, { color: "#F59E0B" }]}>Contraction</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickAction, { backgroundColor: "#D1FAE5" }]} onPress={() => router.push("/grossesse-plus/journal")}>
            <Ionicons name="book" size={24} color="#10B981" />
            <Text style={[styles.quickTxt, { color: "#10B981" }]}>Journal</Text>
          </TouchableOpacity>
        </View>

        {/* Outils */}
        <Text style={styles.sectionTitle}>Mes outils</Text>
        <View style={styles.grid}>
          {tools.map((tt) => (
            <TouchableOpacity key={tt.id} style={styles.gridItem} onPress={() => router.push(tt.nav as any)}>
              <View style={[styles.gridIcon, { backgroundColor: tt.color + "22" }]}>
                <Ionicons name={tt.icon as any} size={22} color={tt.color} />
              </View>
              <Text style={styles.gridLabel}>{tt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Avertissement médical */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={18} color={COLORS.textMuted} />
          <Text style={styles.disclaimerTxt}>Ces informations sont à but éducatif et ne remplacent pas une consultation médicale.</Text>
        </View>

        <TouchableOpacity style={styles.editLink} onPress={() => router.push("/grossesse-plus/setup")}>
          <Ionicons name="settings-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.editLinkTxt}>Modifier ma date de début</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  upgradeCard: { padding: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  upgradeEmoji: { fontSize: 56, marginBottom: 10 },
  upgradeTitle: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  upgradeSub: { color: COLORS.textSecondary, textAlign: "center", marginBottom: 18, lineHeight: 20 },
  featList: { width: "100%", gap: 10, marginBottom: 20 },
  featRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featText: { color: COLORS.textPrimary, flex: 1, fontSize: 13 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 22, borderRadius: RADIUS.pill, width: "100%" },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer: { color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginTop: 12, fontStyle: "italic" },
  emptyCard: { padding: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  hero: { borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  heroTrim: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  heroWeeks: { color: "#fff", fontSize: 56, fontWeight: "800", lineHeight: 60 },
  heroWeeksUnit: { fontSize: 22 },
  heroDays: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  heroRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 5, borderColor: "rgba(255,255,255,0.5)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  heroRingValue: { color: "#fff", fontWeight: "800", fontSize: 22 },
  heroRingLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10 },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 4, overflow: "hidden", marginBottom: 14 },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 4 },
  heroBottom: { flexDirection: "row", justifyContent: "space-between" },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroVal: { color: "#fff", fontWeight: "800", fontSize: 14, marginTop: 2 },
  weekCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  weekIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  weekLbl: { fontSize: 10, color: COLORS.textMuted, fontWeight: "800", letterSpacing: 1 },
  weekFruit: { fontSize: 16, color: COLORS.textPrimary, fontWeight: "700", marginTop: 2 },
  weekStats: { flexDirection: "row", gap: 12, marginTop: 4 },
  weekStat: { fontSize: 13, color: COLORS.textSecondary },
  row: { flexDirection: "row", gap: 10, marginBottom: 16 },
  quickAction: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: RADIUS.md, gap: 4 },
  quickTxt: { fontSize: 11, fontWeight: "800" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: { width: "30%", flexGrow: 1, alignItems: "center", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  gridIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  gridLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "600", textAlign: "center" },
  disclaimerBox: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md, marginTop: 16 },
  disclaimerTxt: { flex: 1, color: COLORS.textMuted, fontSize: 11, lineHeight: 16 },
  editLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, marginTop: 10 },
  editLinkTxt: { color: COLORS.textSecondary, fontSize: 13 },
});
