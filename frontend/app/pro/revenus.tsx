import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function Revenus() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await api.get("/pro/revenus");
      setData(r.data);
    } catch (e) { console.warn(formatError(e)); }
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const d = data || {};
  const rate = Math.round((d.current_commission_rate || 0.1) * 100);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Mes revenus</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl }}>
        <LinearGradient colors={["#059669", "#047857"]} style={styles.hero}>
          <Ionicons name="cash" size={32} color="#fff" />
          <Text style={styles.heroLabel}>Net encaissé</Text>
          <Text style={styles.heroValue}>{(d.total_net_fcfa || 0).toLocaleString()} <Text style={styles.heroUnit}>FCFA</Text></Text>
        </LinearGradient>

        <TouchableOpacity style={styles.withdrawBtn} onPress={() => router.push("/pro/retraits")}>
          <Ionicons name="wallet" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.withdrawTitle}>Retirer vers Mobile Money</Text>
            <Text style={styles.withdrawSub}>Orange, MTN, Moov, Wave — virement instantané</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Brut total</Text>
            <Text style={styles.statVal}>{(d.total_brut_fcfa || 0).toLocaleString()}</Text>
            <Text style={styles.statUnit}>FCFA</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Commission ({rate}%)</Text>
            <Text style={[styles.statVal, { color: "#DC2626" }]}>-{(d.total_commission_fcfa || 0).toLocaleString()}</Text>
            <Text style={styles.statUnit}>FCFA</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>En attente</Text>
            <Text style={styles.statVal}>{d.pending_count || 0}</Text>
            <Text style={styles.statUnit}>RDV</Text>
          </View>
        </View>

        {!d.is_premium && (
          <TouchableOpacity style={styles.upgrade} onPress={() => router.push("/premium")}>
            <Ionicons name="flash" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Passez Pro Premium</Text>
              <Text style={styles.upgradeSub}>Commission réduite de 10% à 5% — vous gagnez 5% de plus sur chaque consultation.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>Revenus par mois</Text>
        {(d.monthly || []).length === 0 ? (
          <Text style={styles.empty}>Aucun revenu pour le moment</Text>
        ) : (d.monthly || []).map((m: any) => (
          <View key={m.month} style={styles.monthRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.monthLabel}>{formatMonth(m.month)}</Text>
              <Text style={styles.monthCount}>{m.count} consultation{m.count > 1 ? "s" : ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.monthNet}>{m.net.toLocaleString()} F</Text>
              <Text style={styles.monthBrut}>Brut {m.brut.toLocaleString()} F · Comm. {m.commission.toLocaleString()} F</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Dernières consultations payées</Text>
        {(d.recent || []).length === 0 ? (
          <Text style={styles.empty}>Aucune consultation payée</Text>
        ) : (d.recent || []).map((p: any) => (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>RDV {p.rdv_id?.slice(0, 8) || "—"}</Text>
              <Text style={styles.rowDate}>{new Date(p.paid_at || p.created_at).toLocaleDateString("fr-FR")}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.rowAmount}>+{(p.pro_amount || 0).toLocaleString()} F</Text>
              <Text style={styles.rowComm}>Commission {(p.commission || 0).toLocaleString()} F</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatMonth(ym: string) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  const mois = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  return `${mois[parseInt(m) - 1] || m} ${y}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl, paddingBottom: 0 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },

  hero: { padding: 20, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 16 },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700", marginTop: 8 },
  heroValue: { color: "#fff", fontSize: 34, fontWeight: "800" },
  heroUnit: { fontSize: 14, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: "center" },
  statVal: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  statUnit: { fontSize: 10, color: COLORS.textMuted, fontWeight: "700" },

  upgrade: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: RADIUS.md, backgroundColor: "#F59E0B", marginBottom: 20 },
  upgradeTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  upgradeSub: { color: "rgba(255,255,255,0.95)", fontSize: 11, marginTop: 2 },

  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: RADIUS.md, backgroundColor: "#0EA5E9", marginBottom: 16 },
  withdrawTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  withdrawSub: { color: "rgba(255,255,255,0.95)", fontSize: 11, marginTop: 2 },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 8 },
  empty: { color: COLORS.textMuted, textAlign: "center", padding: 20 },

  monthRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  monthLabel: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  monthCount: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  monthNet: { fontSize: 14, fontWeight: "800", color: "#059669" },
  monthBrut: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },

  row: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  rowLabel: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  rowDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: "800", color: "#059669" },
  rowComm: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
});
