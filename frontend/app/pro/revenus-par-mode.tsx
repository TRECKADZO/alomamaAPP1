/**
 * Stats par mode 📊 — Pro voit ses revenus segmentés (présentiel / téléconsult / domicile).
 * Route: /pro/revenus-par-mode
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function ProRevenusParMode() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/pro/revenus/par-mode");
        setData(r.data);
      } catch (e) { Alert.alert("Erreur", formatError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  if (!data) return null;

  const MODES: { key: string; label: string; icon: any; color: string; emoji: string }[] = [
    { key: "presentiel", label: "Au cabinet", icon: "medkit", color: "#3B82F6", emoji: "🏥" },
    { key: "teleconsultation", label: "Téléconsultation", icon: "videocam", color: "#A855F7", emoji: "📹" },
    { key: "domicile", label: "À domicile", icon: "home", color: "#F59E0B", emoji: "🏠" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Revenus par mode 📊</Text>
          <Text style={styles.sub}>Répartition présentiel / télé / domicile</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Net total Pro</Text>
          <Text style={styles.totalValue}>{(data.total?.net || 0).toLocaleString()} F CFA</Text>
          <Text style={styles.totalSub}>{data.total?.count || 0} consultation(s) payées · Brut {((data.total?.brut || 0).toLocaleString())} F</Text>
        </View>

        {MODES.map((m) => {
          const stats = data.par_mode?.[m.key] || {};
          const isEmpty = !stats.count;
          const totalPro = data.total?.net || 0;
          const pct = totalPro ? Math.round(((stats.net || 0) / totalPro) * 100) : 0;
          return (
            <View key={m.key} style={[styles.modeCard, { borderTopColor: m.color }]}>
              <View style={styles.modeHead}>
                <Text style={styles.modeEmoji}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeLabel}>{m.label}</Text>
                  <Text style={styles.modeCount}>{stats.count || 0} consultation(s)</Text>
                </View>
                <Text style={[styles.modePct, { color: m.color }]}>{pct}%</Text>
              </View>
              {isEmpty ? (
                <Text style={styles.empty}>Aucune consultation enregistrée dans cette catégorie.</Text>
              ) : (
                <View style={styles.statsGrid}>
                  <Stat label="Brut" value={`${(stats.brut || 0).toLocaleString()} F`} color="#10B981" />
                  <Stat label="Commission" value={`${(stats.commission || 0).toLocaleString()} F`} color="#EF4444" />
                  <Stat label="Net" value={`${(stats.net || 0).toLocaleString()} F`} color={m.color} />
                  {m.key === "domicile" && (
                    <Stat label="Déplacement" value={`${(stats.frais_deplacement || 0).toLocaleString()} F`} color="#F59E0B" />
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.note}>
          <Ionicons name="information-circle" size={16} color={COLORS.textSecondary} />
          <Text style={styles.noteText}>
            Commission différenciée : télé/présentiel = 5% (Premium) ou 10% · à domicile = 7% (Premium) ou 12%.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[stylesS.box, { borderTopColor: color }]}>
      <Text style={stylesS.label}>{label}</Text>
      <Text style={[stylesS.value, { color }]}>{value}</Text>
    </View>
  );
}

const stylesS = StyleSheet.create({
  box: { flex: 1, minWidth: "45%", padding: 10, backgroundColor: COLORS.bgPrimary, borderRadius: 8, alignItems: "center", borderTopWidth: 2 },
  label: { fontSize: 10, color: COLORS.textMuted },
  value: { fontSize: 13, fontWeight: "800", marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  totalCard: { backgroundColor: COLORS.surface, padding: 18, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 16, borderWidth: 2, borderColor: "#10B981" },
  totalLabel: { fontSize: 12, color: COLORS.textSecondary },
  totalValue: { fontSize: 28, fontWeight: "800", color: "#10B981", marginTop: 4 },
  totalSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  modeCard: { backgroundColor: COLORS.surface, padding: 14, borderRadius: RADIUS.md, marginBottom: 12, borderTopWidth: 3, borderWidth: 1, borderColor: COLORS.border },
  modeHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modeEmoji: { fontSize: 28 },
  modeLabel: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  modeCount: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  modePct: { fontSize: 18, fontWeight: "800" },
  empty: { fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 14 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  note: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginTop: 8, borderWidth: 1, borderColor: COLORS.border },
  noteText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
});
