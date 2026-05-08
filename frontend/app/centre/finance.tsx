/**
 * Finance Centre 💎 — Revenus/commissions par pro membre.
 * Réservé aux Centres Premium.
 * Route: /centre/finance
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import PremiumGate from "../../components/PremiumGate";

export default function CentreFinance() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [premiumBlocked, setPremiumBlocked] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setPremiumBlocked(null);
    try {
      const r = await api.get("/centre/finance");
      setData(r.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        setPremiumBlocked(detail.message || "La gestion financière est réservée aux Centres Premium.");
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Finance par Pro 💎</Text>
          <Text style={styles.sub}>{data?.membres_count ?? 0} pro(s) · Revenus consolidés</Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : premiumBlocked ? (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          <PremiumGate
            message={premiumBlocked}
            color="#10B981"
            benefits="Inclus avec Centre Premium : Gestion financière par pro · Tableau de bord · Export comptable · Support prioritaire."
          />
        </ScrollView>
      ) : !data ? null : (
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <View style={styles.totalsRow}>
          <Total label="Brut total" value={`${(data.total_brut_fcfa || 0).toLocaleString()} F`} color="#10B981" />
          <Total label="Commissions" value={`${(data.total_commission_fcfa || 0).toLocaleString()} F`} color="#EF4444" />
          <Total label="Net Pros" value={`${(data.total_net_fcfa || 0).toLocaleString()} F`} color="#3B82F6" />
        </View>

        <Text style={styles.section}>Détail par professionnel</Text>
        {(data.pros || []).length === 0 ? (
          <Text style={styles.empty}>Aucun pro membre. Invitez vos premiers professionnels depuis « Membres ».</Text>
        ) : (
          (data.pros || []).map((p: any) => (
            <View key={p.pro_id} style={styles.proCard}>
              <View style={styles.proHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.proName}>{p.name}</Text>
                  <Text style={styles.proSpec}>{p.specialite || "—"}{p.phone ? ` · ${p.phone}` : ""}</Text>
                </View>
                <View style={styles.rdvBadge}>
                  <Text style={styles.rdvBadgeText}>{p.rdv_count} RDV</Text>
                </View>
              </View>
              <View style={styles.proStats}>
                <View style={styles.proStat}>
                  <Text style={styles.proStatLabel}>Brut</Text>
                  <Text style={[styles.proStatValue, { color: "#10B981" }]}>{(p.brut_fcfa || 0).toLocaleString()} F</Text>
                </View>
                <View style={styles.proStat}>
                  <Text style={styles.proStatLabel}>Commission</Text>
                  <Text style={[styles.proStatValue, { color: "#EF4444" }]}>{(p.commission_fcfa || 0).toLocaleString()} F</Text>
                </View>
                <View style={styles.proStat}>
                  <Text style={styles.proStatLabel}>Net</Text>
                  <Text style={[styles.proStatValue, { color: "#3B82F6" }]}>{(p.net_fcfa || 0).toLocaleString()} F</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <Text style={styles.note}>
          💡 Le « Net Pro » est le montant qui revient au professionnel après déduction de la commission plateforme. La commission est de 5% pour les Pros Premium et 10% sinon.
        </Text>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Total({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[stylesT.card, { borderTopColor: color }]}>
      <Text style={stylesT.label}>{label}</Text>
      <Text style={[stylesT.value, { color }]}>{value}</Text>
    </View>
  );
}

const stylesT = StyleSheet.create({
  card: { flex: 1, backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, alignItems: "center", borderTopWidth: 3 },
  label: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  value: { fontSize: 14, fontWeight: "800" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  totalsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  section: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  proCard: { backgroundColor: COLORS.surface, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  proHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  proName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  proSpec: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  rdvBadge: { backgroundColor: "#A855F7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  rdvBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  proStats: { flexDirection: "row", gap: 8 },
  proStat: { flex: 1, padding: 8, backgroundColor: COLORS.bgPrimary, borderRadius: 8, alignItems: "center" },
  proStatLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2 },
  proStatValue: { fontSize: 12, fontWeight: "800" },
  empty: { fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 20 },
  note: { fontSize: 11, color: COLORS.textSecondary, marginTop: 16, lineHeight: 16, textAlign: "center", paddingHorizontal: 12 },
});
