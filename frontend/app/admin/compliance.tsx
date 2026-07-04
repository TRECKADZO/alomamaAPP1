/**
 * Rapport de conformité RGSSI N3 + RGPD + MSP CI en temps réel
 * Score global · Statut par contrôle · Preuves techniques
 */
import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "../../lib/api";

type Check = {
  id: string;
  category: string;
  label: string;
  status: "ok" | "warning" | "fail";
  evidence: string;
  norm: string;
};
type Report = {
  generated_at: string;
  framework: string;
  stats: { total: number; ok: number; warning: number; fail: number; score_percent: number };
  checks: Check[];
};

export default function ComplianceScreen() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/compliance/report");
      setReport(r.data);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;
  if (!report) return <SafeAreaView style={s.loader}><Text>Chargement impossible.</Text></SafeAreaView>;

  const scoreColor = report.stats.score_percent >= 90 ? "#059669" : report.stats.score_percent >= 70 ? "#F59E0B" : "#DC2626";
  const grouped = report.checks.reduce<Record<string, Check[]>>((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Header score global */}
        <View style={[s.hero, { backgroundColor: scoreColor + "15" }]}>
          <View style={[s.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[s.scorePct, { color: scoreColor }]}>{report.stats.score_percent}%</Text>
            <Text style={s.scoreLabel}>conforme</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>🛡️ Rapport de conformité</Text>
            <Text style={s.heroSub}>{report.framework}</Text>
            <View style={s.statsRow}>
              <View style={[s.statPill, { backgroundColor: "#DCFCE7" }]}>
                <Text style={[s.statTxt, { color: "#059669" }]}>{report.stats.ok} ✓</Text>
              </View>
              <View style={[s.statPill, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[s.statTxt, { color: "#B45309" }]}>{report.stats.warning} ⚠</Text>
              </View>
              <View style={[s.statPill, { backgroundColor: "#FEE2E2" }]}>
                <Text style={[s.statTxt, { color: "#DC2626" }]}>{report.stats.fail} ✗</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={s.updated}>
          🕒 Généré le {new Date(report.generated_at).toLocaleString("fr-FR")}
        </Text>

        {/* Checks groupés par catégorie */}
        {Object.entries(grouped).map(([cat, checks]) => (
          <View key={cat} style={s.categoryBlock}>
            <Text style={s.categoryTitle}>{cat}</Text>
            {checks.map((c) => {
              const iconMap: Record<string, string> = { ok: "checkmark-circle", warning: "alert-circle", fail: "close-circle" };
              const colorMap: Record<string, string> = { ok: "#059669", warning: "#F59E0B", fail: "#DC2626" };
              return (
                <View key={c.id} style={s.check}>
                  <Ionicons name={iconMap[c.status] as any} size={22} color={colorMap[c.status]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.checkLabel}>{c.label}</Text>
                    <Text style={s.checkEvidence}>{c.evidence}</Text>
                    <View style={s.normBadge}>
                      <Text style={s.normTxt}>📜 {c.norm}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.footer}>
          <Ionicons name="information-circle" size={18} color="#0369A1" />
          <Text style={s.footerTxt}>
            Ce rapport reflète l'état SÉCURITÉ en temps réel.{"\n"}
            Les warnings sont des recommandations de production (ex. CORS restrictif, 2FA à activer).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 60 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 16, marginBottom: 10 },
  scoreCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  scorePct: { fontSize: 24, fontWeight: "900" },
  scoreLabel: { fontSize: 10, color: "#64748B", fontWeight: "700", textTransform: "uppercase" },
  heroTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  heroSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  statPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statTxt: { fontWeight: "800", fontSize: 12 },
  updated: { fontSize: 11, color: "#94A3B8", marginBottom: 14, fontStyle: "italic" },
  categoryBlock: { marginBottom: 16 },
  categoryTitle: { fontWeight: "800", color: "#334155", fontSize: 13, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  check: { flexDirection: "row", gap: 12, backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 6, alignItems: "flex-start" },
  checkLabel: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  checkEvidence: { color: "#475569", fontSize: 12, marginTop: 4, lineHeight: 17 },
  normBadge: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#F1F5F9", borderRadius: 6 },
  normTxt: { fontSize: 10, color: "#64748B", fontFamily: "monospace" },
  footer: { flexDirection: "row", gap: 8, backgroundColor: "#E0F2FE", padding: 12, borderRadius: 10, alignItems: "flex-start", marginTop: 8 },
  footerTxt: { flex: 1, color: "#0369A1", fontSize: 11, lineHeight: 15 },
});
