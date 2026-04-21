import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function AdminAnalytics() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/analytics");
      setData(data);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading || !data) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#C85A40", "#A64A35"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.sub}>Vue d'ensemble de l'application</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <Text style={styles.sectionTitle}>Activité des 7 derniers jours</Text>
        <View style={styles.metricsRow}>
          <MetricCard icon="person-add" label="Nouveaux users" value={data.activity_7d.new_users} color="#10B981" />
          <MetricCard icon="calendar" label="Nouveaux RDV" value={data.activity_7d.new_rdv} color="#3B82F6" />
          <MetricCard icon="chatbubbles" label="Nouveaux posts" value={data.activity_7d.new_posts} color="#F59E0B" />
        </View>

        <Text style={styles.sectionTitle}>Répartition des rôles</Text>
        <View style={styles.card}>
          {Object.entries(data.roles_distribution).map(([role, count]: any) => (
            <View key={role} style={styles.rowItem}>
              <Text style={styles.rowLabel}>{role}</Text>
              <View style={styles.rowBar}>
                <View style={[styles.rowBarFill, { width: `${Math.min(100, (count / Math.max(...(Object.values(data.roles_distribution) as number[]))) * 100)}%` }]} />
              </View>
              <Text style={styles.rowValue}>{count}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Top villes</Text>
        <View style={styles.card}>
          {data.top_villes.length === 0 ? (
            <Text style={{ color: COLORS.textMuted, fontStyle: "italic" }}>Aucune ville renseignée</Text>
          ) : (
            data.top_villes.map((v: any, i: number) => (
              <View key={v.ville} style={styles.rowItem}>
                <Text style={styles.rowRank}>#{i + 1}</Text>
                <Text style={styles.rowLabel}>{v.ville}</Text>
                <Text style={styles.rowValue}>{v.count}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Premium & RDV</Text>
        <View style={styles.metricsRow}>
          <MetricCard icon="diamond" label="Premium actifs" value={data.premium_users} color="#F59E0B" />
          {Object.entries(data.rdv_par_statut).slice(0, 2).map(([statut, count]: any) => (
            <MetricCard key={statut} icon="calendar" label={statut} value={count} color="#A855F7" />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ icon, label, value, color }: any) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.metricVal, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14, marginTop: 16, marginBottom: 10, textTransform: "capitalize" },
  metricsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metricCard: { flex: 1, minWidth: 100, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  metricIcon: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  metricVal: { fontWeight: "800", fontSize: 20 },
  metricLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, ...SHADOW },
  rowItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  rowRank: { color: COLORS.primary, fontWeight: "800", fontSize: 12, width: 28 },
  rowLabel: { flex: 1, color: COLORS.textPrimary, fontWeight: "600", fontSize: 13, textTransform: "capitalize" },
  rowValue: { color: COLORS.primary, fontWeight: "800", fontSize: 14 },
  rowBar: { flex: 2, height: 6, backgroundColor: COLORS.bgSecondary, borderRadius: 3, overflow: "hidden" },
  rowBarFill: { height: "100%", backgroundColor: COLORS.primary, borderRadius: 3 },
});
