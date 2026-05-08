/**
 * Tableau de bord Centre 💎 — Stats agrégées des pros membres.
 * Réservé aux Centres Premium.
 * Route: /centre/dashboard
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function CentreDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/centre/dashboard");
      setData(r.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        Alert.alert("Premium requis 💎", detail.message, [
          { text: "Plus tard", style: "cancel", onPress: () => router.back() },
          { text: "Devenir Premium", onPress: () => router.push("/premium") },
        ]);
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  if (!data) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#A855F7", "#7C3AED"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Tableau de bord 💎</Text>
          <Text style={styles.sub}>{data.centre?.nom || "Mon centre"}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <Text style={styles.section}>Indicateurs clés</Text>
        <View style={styles.statsGrid}>
          <KPI color="#A855F7" icon="people" label="Membres" value={String(data.membres_count || 0)} />
          <KPI color="#3B82F6" icon="calendar" label="RDV total" value={String(data.rdv_total || 0)} />
          <KPI color="#10B981" icon="trending-up" label="RDV ce mois" value={String(data.rdv_ce_mois || 0)} />
          <KPI color="#F59E0B" icon="checkmark-circle" label="RDV payés" value={String(data.rdv_paye || 0)} />
        </View>

        <Text style={styles.section}>Revenus</Text>
        <View style={styles.revRow}>
          <View style={[styles.revCard, { backgroundColor: "#10B98115" }]}>
            <Text style={styles.revLabel}>Brut généré</Text>
            <Text style={[styles.revValue, { color: "#10B981" }]}>{(data.revenu_brut_fcfa || 0).toLocaleString()} F</Text>
          </View>
          <View style={[styles.revCard, { backgroundColor: "#3B82F615" }]}>
            <Text style={styles.revLabel}>Net Pros</Text>
            <Text style={[styles.revValue, { color: "#3B82F6" }]}>{(data.revenu_pros_fcfa || 0).toLocaleString()} F</Text>
          </View>
        </View>

        <Text style={styles.section}>Top professionnels</Text>
        {(data.top_pros || []).length === 0 ? (
          <Text style={styles.empty}>Aucun pro avec activité enregistrée.</Text>
        ) : (
          (data.top_pros || []).map((p: any, i: number) => (
            <View key={p.pro_id} style={styles.proRow}>
              <View style={[styles.proRank, { backgroundColor: i === 0 ? "#F59E0B" : i === 1 ? "#9CA3AF" : i === 2 ? "#92400E" : "#E5E7EB" }]}>
                <Text style={[styles.proRankText, { color: i < 3 ? "#fff" : "#374151" }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.proName}>{p.name}</Text>
                <Text style={styles.proSpec}>{p.specialite || "—"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.proRdv}>{p.rdv_total} RDV</Text>
                <Text style={styles.proRev}>{(p.revenu_total_fcfa || 0).toLocaleString()} F</Text>
              </View>
            </View>
          ))
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => router.push("/centre/finance")}>
            <Ionicons name="cash" size={18} color="#fff" />
            <Text style={styles.actionText}>Finance par pro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#0EA5E9" }]} onPress={() => router.push("/centre/export")}>
            <Ionicons name="cloud-download" size={18} color="#fff" />
            <Text style={styles.actionText}>Exporter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KPI({ color, icon, label, value }: { color: string; icon: any; label: string; value: string }) {
  return (
    <View style={[stylesK.card, { borderTopColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={stylesK.value}>{value}</Text>
      <Text style={stylesK.label}>{label}</Text>
    </View>
  );
}

const stylesK = StyleSheet.create({
  card: { width: "48%", backgroundColor: COLORS.surface, padding: 14, borderRadius: RADIUS.md, borderTopWidth: 3, alignItems: "center", marginBottom: 8 },
  value: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  label: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  section: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, marginTop: 14 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: "4%" as any },
  revRow: { flexDirection: "row", gap: 10 },
  revCard: { flex: 1, padding: 14, borderRadius: RADIUS.md },
  revLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  revValue: { fontSize: 18, fontWeight: "800" },
  proRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  proRank: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  proRankText: { fontSize: 13, fontWeight: "800" },
  proName: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  proSpec: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  proRdv: { fontSize: 12, fontWeight: "800", color: COLORS.textPrimary },
  proRev: { fontSize: 11, color: "#10B981", marginTop: 2, fontWeight: "700" },
  empty: { fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 20 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: RADIUS.md, ...SHADOW },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
