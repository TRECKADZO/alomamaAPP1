/**
 * Admin — Analytics « Trouver un Pro » (Phase 5 UNICEF/Ministère)
 * KPIs stratégiques pour partenariats B2B :
 *  - Couverture santé maternelle par région (établissements officiels)
 *  - Déserts médicaux (communes avec mamans mais sans maternité)
 *  - Orientations effectuées (impact réel)
 *  - Export CSV pour partenaires
 */
import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Paths, File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, formatError, TOKEN_KEY } from "../../lib/api";

const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

const PERIODS: { key: string; label: string }[] = [
  { key: "7d", label: "7 j" },
  { key: "30d", label: "30 j" },
  { key: "90d", label: "90 j" },
  { key: "all", label: "Tout" },
];

type Analytics = any;

export default function AdminAnalyticsEtabScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<Analytics>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const r = await api.get(`/admin/analytics/etablissements`, { params: { period } });
      setData(r.data);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setLoading(false); }
  };
  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => { load(); }, [period]),
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const url = `${API_BASE}/admin/analytics/etablissements/export.csv?period=${period}`;
      if (Platform.OS === "web") {
        // Sur web, on doit passer par fetch + blob car les download natifs perdent le header auth
        const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = `alomaman_analytics_${period}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(dlUrl);
      } else {
        // Mobile : fetch + écriture avec la nouvelle API expo-file-system 19
        const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const content = await resp.text();
        const filename = `alomaman_analytics_${period}_${Date.now()}.csv`;
        const file = new File(Paths.cache, filename);
        try { file.delete(); } catch {}
        file.create();
        file.write(content);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "Exporter les analytics" });
        } else {
          Alert.alert("Exporté", `Fichier sauvegardé : ${file.uri}`);
        }
      }
    } catch (e) {
      Alert.alert("Erreur export", formatError(e));
    } finally { setExporting(false); }
  };

  if (loading || !data) {
    return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;
  }

  const cov = data.coverage;
  const orient = data.orientations;
  const claims = data.pro_claims;
  const deserts = data.desert_medical;
  const underserved = data.underserved_regions;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <LinearGradient colors={["#7C3AED", "#5B21B6"]} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>📊 Analytics Établissements</Text>
          <Text style={s.sub}>UNICEF · Ministère · Partenaires B2B</Text>
        </View>
        <TouchableOpacity onPress={exportCsv} disabled={exporting} style={s.exportBtn}>
          {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download" size={18} color="#fff" />}
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        {/* Sélecteur période */}
        <View style={s.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[s.periodChip, period === p.key && s.periodChipActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[s.periodChipTxt, period === p.key && s.periodChipTxtActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI Couverture */}
        <Text style={s.sectionTitle}>🏥 Couverture santé maternelle</Text>
        <View style={s.kpiGrid}>
          <KpiCard icon="business" value={cov.total_etablissements} label="Établissements" color="#7C3AED" />
          <KpiCard icon="location" value={`${cov.geocoded_pct}%`} label="Géocodés" color="#0891B2" />
          <KpiCard icon="heart" value={cov.maternite} label="Maternités" color="#EC4899" />
          <KpiCard icon="happy" value={cov.pediatrie} label="Pédiatries" color="#F59E0B" />
        </View>
        <Text style={s.sourceTxt}>Source : {cov.source}</Text>

        {/* Orientations effectuées */}
        <Text style={s.sectionTitle}>🎯 Orientations effectuées</Text>
        <View style={s.kpiGrid}>
          <KpiCard icon="analytics" value={orient.total} label={`Total ${period}`} color="#059669" />
          <KpiCard icon="alert" value={orient.tnd} label="TND (neurodev)" color="#DC2626" />
          <KpiCard icon="rose" value={orient.postpartum} label="Post-Partum" color="#DB2777" />
        </View>
        {orient.by_region_top20.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Régions les plus orientées</Text>
            <BarChart items={orient.by_region_top20.slice(0, 8).map((r: any) => ({ label: r.region, value: r.count }))} color="#7C3AED" />
          </View>
        )}

        {/* Déserts médicaux */}
        <Text style={s.sectionTitle}>🚨 Déserts médicaux</Text>
        <View style={[s.card, deserts.count > 0 && { borderColor: "#DC2626", borderWidth: 1 }]}>
          <Text style={s.cardTitle}>
            {deserts.count} commune{deserts.count > 1 ? "s" : ""} identifiée{deserts.count > 1 ? "s" : ""}
          </Text>
          <Text style={s.hint}>
            Communes avec ≥{deserts.threshold_mamans} mamans utilisatrices mais AUCUNE maternité disponible.
          </Text>
          {deserts.communes.slice(0, 10).map((d: any) => (
            <View key={d.commune} style={s.desertRow}>
              <Ionicons name="warning" size={14} color="#DC2626" />
              <Text style={s.desertName}>{d.commune}</Text>
              <Text style={s.desertVal}>{d.mamans} mamans · 0 maternité</Text>
            </View>
          ))}
          {deserts.communes.length === 0 && (
            <Text style={s.hint}>Aucun désert médical détecté sur la période. Bonne couverture ! 💚</Text>
          )}
        </View>

        {/* Régions sous-dotées */}
        {underserved.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Régions sous-dotées ({'<'} 2 maternités)</Text>
            {underserved.slice(0, 10).map((r: any) => (
              <View key={r.region} style={s.rowItem}>
                <Text style={s.rowLabel}>{r.region}</Text>
                <Text style={s.rowVal}>{r.total} étab. · {r.maternite} maternité{r.maternite > 1 ? "s" : ""}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Couverture par région (top 10) */}
        <Text style={s.sectionTitle}>🌍 Top 10 régions</Text>
        <View style={s.card}>
          <BarChart
            items={data.by_region.slice(0, 10).map((r: any) => ({
              label: r.region,
              value: r.total,
              sub: `${r.maternite}M · ${r.pediatrie}P`,
            }))}
            color="#0891B2"
          />
        </View>

        {/* Heatmap communes */}
        <Text style={s.sectionTitle}>📍 Heatmap communes (top 10)</Text>
        <View style={s.card}>
          <BarChart
            items={data.by_commune_top30.slice(0, 10).map((c: any) => ({
              label: c.commune,
              value: c.total,
              sub: `${c.maternite}M · ${c.pediatrie}P`,
            }))}
            color="#EC4899"
          />
        </View>

        {/* Utilisateurs */}
        <Text style={s.sectionTitle}>👥 Demande utilisateurs</Text>
        <View style={s.kpiGrid}>
          <KpiCard icon="woman" value={data.user_demand.total_mamans} label="Mamans" color="#EC4899" />
          <KpiCard icon="medkit" value={data.user_demand.total_pros} label="Professionnels" color="#7C3AED" />
          <KpiCard icon="business-outline" value={data.user_demand.total_centres} label="Centres" color="#059669" />
        </View>

        {/* Claims pro */}
        <Text style={s.sectionTitle}>📋 Demandes pros ({claims.total})</Text>
        <View style={s.card}>
          {Object.entries(claims.by_status).length === 0 ? (
            <Text style={s.hint}>Aucune demande pour l&apos;instant.</Text>
          ) : (
            Object.entries(claims.by_status).map(([status, count]: any) => (
              <View key={status} style={s.rowItem}>
                <Text style={s.rowLabel}>{status.replace("_", " ")}</Text>
                <Text style={s.rowVal}>{count}</Text>
              </View>
            ))
          )}
          <TouchableOpacity style={s.viewClaimsBtn} onPress={() => router.push("/admin/pro_claims" as any)}>
            <Text style={s.viewClaimsTxt}>Voir toutes les demandes →</Text>
          </TouchableOpacity>
        </View>

        {/* Export CTA */}
        <TouchableOpacity style={s.exportCta} onPress={exportCsv} disabled={exporting}>
          {exporting ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="download" size={20} color="#fff" />
              <Text style={s.exportCtaTxt}>Exporter le rapport pour UNICEF/Ministère (CSV)</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.footer}>
          Rapport généré le {new Date(data.generated_at).toLocaleString("fr-FR")}.
          Source Ministère de la Santé & Hygiène Publique — E-DEPPS.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===== Composants ===== */

function KpiCard({ icon, value, label, color }: any) {
  return (
    <View style={[s.kpiCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function BarChart({ items, color }: { items: { label: string; value: number; sub?: string }[]; color: string }) {
  if (!items || items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <View style={{ marginTop: 4 }}>
      {items.map((it) => (
        <View key={it.label} style={s.barItem}>
          <View style={s.barHeader}>
            <Text style={s.barLabel} numberOfLines={1}>{it.label}</Text>
            <Text style={s.barValue}>{it.value}{it.sub ? ` · ${it.sub}` : ""}</Text>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.max(4, (it.value * 100) / max)}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 18 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
  exportBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  periodRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: "#EDE9FE" },
  periodChipActive: { backgroundColor: "#7C3AED" },
  periodChipTxt: { color: "#5B21B6", fontSize: 12, fontWeight: "800" },
  periodChipTxtActive: { color: "#fff" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 16, marginBottom: 8 },
  sourceTxt: { color: "#64748B", fontSize: 10, fontStyle: "italic", marginTop: -4, marginBottom: 6 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { flex: 1, minWidth: "45%", backgroundColor: "#fff", padding: 12, borderRadius: 10, borderLeftWidth: 4 },
  kpiValue: { fontSize: 22, fontWeight: "800", color: "#0F172A", marginTop: 4 },
  kpiLabel: { fontSize: 11, color: "#64748B", fontWeight: "600" },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginTop: 8 },
  cardTitle: { fontWeight: "800", color: "#0F172A", fontSize: 13, marginBottom: 8 },
  hint: { color: "#64748B", fontSize: 12, marginTop: 4, lineHeight: 16 },
  desertRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" },
  desertName: { flex: 1, color: "#0F172A", fontWeight: "700", fontSize: 12 },
  desertVal: { color: "#DC2626", fontSize: 11, fontWeight: "800" },
  rowItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: "#334155", fontSize: 12, textTransform: "capitalize" },
  rowVal: { color: "#0F172A", fontSize: 12, fontWeight: "700" },
  barItem: { marginVertical: 4 },
  barHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  barLabel: { color: "#334155", fontSize: 11, fontWeight: "700", flex: 1, marginRight: 6 },
  barValue: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  barTrack: { height: 8, backgroundColor: "#F1F5F9", borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  viewClaimsBtn: { padding: 10, alignItems: "center", marginTop: 6 },
  viewClaimsTxt: { color: "#7C3AED", fontWeight: "700", fontSize: 12 },
  exportCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#7C3AED", padding: 16, borderRadius: 12, marginTop: 20 },
  exportCtaTxt: { color: "#fff", fontWeight: "800", fontSize: 13, flexShrink: 1, textAlign: "center" },
  footer: { color: "#94A3B8", fontSize: 10, textAlign: "center", marginTop: 16, lineHeight: 14 },
});
