import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function ProCMU() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [accepte, setAccepte] = useState<boolean>(!!user?.accepte_cmu);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    try {
      const { data } = await api.get("/pro/facturation-cmu");
      setStats(data);
    } catch {}
    finally { setLoading(false); }
  })(); }, []);

  const toggle = async (v: boolean) => {
    setAccepte(v);
    try {
      await api.patch("/pro/cmu", { accepte_cmu: v });
      refresh();
    } catch (e) { Alert.alert("Erreur", formatError(e)); setAccepte(!v); }
  };

  const exportCsv = async () => {
    const url = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/pro/facturation-cmu/csv`;
    if (typeof window !== "undefined") (window as any).open(url, "_blank");
    else Alert.alert("Téléchargement", url);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Facturation CMU</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <LinearGradient colors={["#16A34A", "#15803D"]} style={styles.hero}>
          <Ionicons name="shield-checkmark" size={32} color="#fff" />
          <Text style={styles.heroTitle}>Acceptez-vous la CMU ?</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>J'accepte la Couverture Maladie Universelle</Text>
            <Switch value={accepte} onValueChange={toggle} />
          </View>
          {accepte && <Text style={styles.heroHelp}>Votre profil est visible aux mamans CMU. Marquez les prestations concernées dans « Mes prestations ».</Text>}
        </LinearGradient>

        {loading ? <ActivityIndicator color={COLORS.primary} /> : stats && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>RDV CMU</Text>
                <Text style={styles.statVal}>{stats.total_rdv || 0}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Brut</Text>
                <Text style={[styles.statVal, { color: "#059669" }]}>{(stats.total_brut_fcfa || 0).toLocaleString()}</Text>
                <Text style={styles.unit}>FCFA</Text>
              </View>
            </View>
            <View style={styles.bigCard}>
              <Text style={styles.bigLabel}>💰 Dû par la CMU (État)</Text>
              <Text style={styles.bigVal}>{(stats.total_cmu_du_fcfa || 0).toLocaleString()} FCFA</Text>
              <Text style={styles.bigHelp}>Payé directement par vos patientes : {(stats.total_reste_a_charge_fcfa || 0).toLocaleString()} FCFA</Text>
            </View>

            <TouchableOpacity style={styles.exportBtn} onPress={exportCsv}>
              <Ionicons name="download" size={18} color="#fff" />
              <Text style={styles.exportText}>Exporter en CSV pour la CNAM</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Dernières consultations CMU</Text>
            {(stats.rdvs || []).slice(0, 20).map((r: any) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{r.maman_nom || "—"}</Text>
                  <Text style={styles.rowMeta}>N° CMU {r.numero_cmu || "?"} · {new Date(r.date).toLocaleDateString("fr-FR")}</Text>
                  <Text style={styles.rowMeta}>{r.prestation_nom || r.motif}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowAmount}>+{(r.cmu_montant_fcfa || 0).toLocaleString()}</Text>
                  <Text style={styles.rowTaux}>{Math.round((r.cmu_taux || 0) * 100)}% CMU</Text>
                </View>
              </View>
            ))}
            {(stats.rdvs || []).length === 0 && <Text style={styles.empty}>Aucune consultation CMU pour le moment.</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl, paddingBottom: 0 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },

  hero: { padding: 18, borderRadius: RADIUS.lg, marginBottom: 16 },
  heroTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: RADIUS.md },
  switchLabel: { color: "#fff", fontWeight: "700", fontSize: 13, flex: 1 },
  heroHelp: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 10, lineHeight: 16 },

  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  statLabel: { fontSize: 11, color: COLORS.textSecondary },
  statVal: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  unit: { fontSize: 10, color: COLORS.textMuted },

  bigCard: { backgroundColor: "#D1FAE5", borderRadius: RADIUS.lg, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#059669" },
  bigLabel: { color: "#065F46", fontWeight: "800", fontSize: 13 },
  bigVal: { color: "#065F46", fontSize: 28, fontWeight: "800", marginTop: 4 },
  bigHelp: { color: "#047857", fontSize: 11, marginTop: 4 },

  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#059669", paddingVertical: 12, borderRadius: 999, marginTop: 14 },
  exportText: { color: "#fff", fontWeight: "800" },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 20, marginBottom: 10 },
  row: { flexDirection: "row", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  rowName: { fontWeight: "800", fontSize: 13, color: COLORS.textPrimary },
  rowMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: "800", color: "#059669" },
  rowTaux: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  empty: { textAlign: "center", color: COLORS.textMuted, padding: 20 },
});
