/**
 * Dashboard Admin RGSSI — Conformité Niveau 3
 * Route: /admin/rgssi
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function AdminRGSSI() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [accessReview, setAccessReview] = useState<any>(null);
  const [incidents, setIncidents] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, ar, inc] = await Promise.all([
          api.get("/admin/rgssi/compliance"),
          api.get("/admin/rgssi/users-access-review"),
          api.get("/incidents"),
        ]);
        setData(c.data);
        setAccessReview(ar.data);
        setIncidents(inc.data);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  if (loading || !data) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  }

  const domains = Object.values(data.domains) as any[];
  const compliantCount = domains.filter((d: any) => d.compliant).length;
  const compliancePct = Math.round(100 * compliantCount / domains.length);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#0E7C3E", "#10B981"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>⚖️ Conformité RGSSI</Text>
          <Text style={styles.sub}>Niveau {data.rgssi_level} · ANSSI Côte d'Ivoire</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <View style={styles.heroCard}>
          <Text style={styles.heroNum}>{compliancePct}%</Text>
          <Text style={styles.heroLabel}>de conformité</Text>
          <Text style={styles.heroDetail}>{compliantCount}/{domains.length} domaines OK</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat color="#3B82F6" label="Pros 2FA" value={data.domains.B7_access_control.metrics.pros_2fa} max={data.domains.B7_access_control.metrics.pros_total} icon="shield" />
          <Stat color="#EF4444" label="Incidents 90j" value={data.domains.B14_incidents.metrics.incidents_90d} icon="warning" />
          <Stat color="#10B981" label="Audit 30j" value={data.domains.B14_audit_log.metrics.events_30d} icon="document" />
        </View>

        <Text style={styles.sectionTitle}>📊 Domaines RGSSI N3</Text>
        {domains.map((d: any, i: number) => (
          <View key={i} style={styles.domainCard}>
            <View style={styles.domainHead}>
              <Text style={styles.domainTitle}>{d.title}</Text>
              <View style={[styles.statusBadge, d.compliant ? styles.badgeOk : styles.badgeKo]}>
                <Text style={[styles.statusText, { color: d.compliant ? "#065F46" : "#7F1D1D" }]}>
                  {d.compliant ? "✓ OK" : "⚠️ Action"}
                </Text>
              </View>
            </View>
            {d.score !== undefined && (
              <View style={styles.scoreBar}>
                <View style={[styles.scoreFill, { width: `${d.score || 0}%`, backgroundColor: d.compliant ? "#10B981" : "#F59E0B" }]} />
              </View>
            )}
            {d.metrics && (
              <Text style={styles.metricsText}>
                {Object.entries(d.metrics).map(([k, v]: any) => `${k}: ${Array.isArray(v) ? v.length : v}`).join(" · ")}
              </Text>
            )}
          </View>
        ))}

        <Text style={styles.sectionTitle}>🚨 Incidents</Text>
        <View style={styles.incidentsCard}>
          <View style={styles.incRow}>
            <Text style={styles.incNum}>{incidents?.stats?.open || 0}</Text>
            <Text style={styles.incLabel}>Ouverts</Text>
          </View>
          <View style={styles.incRow}>
            <Text style={[styles.incNum, { color: "#F59E0B" }]}>{incidents?.stats?.investigating || 0}</Text>
            <Text style={styles.incLabel}>En enquête</Text>
          </View>
          <View style={styles.incRow}>
            <Text style={[styles.incNum, { color: "#10B981" }]}>{incidents?.stats?.resolved || 0}</Text>
            <Text style={styles.incLabel}>Résolus</Text>
          </View>
          <View style={styles.incRow}>
            <Text style={[styles.incNum, { color: "#EF4444" }]}>{incidents?.stats?.critical || 0}</Text>
            <Text style={styles.incLabel}>Critiques</Text>
          </View>
        </View>
        {incidents?.stats?.anssi_pending > 0 && (
          <View style={styles.anssiAlert}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.anssiText}>{incidents.stats.anssi_pending} incident(s) en attente de notification ANSSI</Text>
          </View>
        )}

        <TouchableOpacity style={styles.btnDeclare} onPress={() => router.push("/security/incident-new")}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.btnText}>Déclarer un incident</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>👥 Revue d'accès trimestrielle</Text>
        <View style={styles.accessCard}>
          <Text style={styles.accessTotal}>{accessReview?.total_users} utilisateurs · {accessReview?.active_90d} actifs · {accessReview?.inactive_90d} inactifs</Text>
          <View style={styles.byRole}>
            {Object.entries(accessReview?.by_role || {}).map(([role, n]: any) => (
              <Text key={role} style={styles.byRoleText}>{role}: {n}</Text>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>📋 Documents officiels</Text>
        <TouchableOpacity style={styles.docLink} onPress={() => router.push("/security/docs?name=PSSI")}>
          <Text style={styles.docEmoji}>📋</Text><Text style={styles.docTitle}>PSSI v1.0</Text><Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.docLink} onPress={() => router.push("/security/docs?name=PAS_2026")}>
          <Text style={styles.docEmoji}>📅</Text><Text style={styles.docTitle}>Plan Annuel de Sécurisation 2026</Text><Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.docLink} onPress={() => router.push("/security/docs?name=ANALYSE_RISQUES")}>
          <Text style={styles.docEmoji}>⚠️</Text><Text style={styles.docTitle}>Analyse de Risques (EBIOS)</Text><Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ color, label, value, max, icon }: any) {
  return (
    <View style={[styles.stat, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statNum, { color }]}>{value}{max ? `/${max}` : ""}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  heroCard: { padding: 18, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, alignItems: "center", ...SHADOW },
  heroNum: { fontSize: 50, fontWeight: "900", color: "#10B981" },
  heroLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "700" },
  heroDetail: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { flex: 1, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 3 },
  statNum: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: "700", marginTop: 2 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 22, marginBottom: 8 },

  domainCard: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  domainHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  domainTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeOk: { backgroundColor: "#D1FAE5" },
  badgeKo: { backgroundColor: "#FEE2E2" },
  statusText: { fontSize: 10, fontWeight: "800" },
  scoreBar: { height: 5, backgroundColor: "#E5E7EB", borderRadius: 3, marginTop: 8, overflow: "hidden" },
  scoreFill: { height: "100%" },
  metricsText: { fontSize: 10, color: COLORS.textMuted, marginTop: 6 },

  incidentsCard: { flexDirection: "row", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  incRow: { flex: 1, alignItems: "center" },
  incNum: { fontSize: 22, fontWeight: "900", color: COLORS.textPrimary },
  incLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },

  anssiAlert: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF4444", padding: 10, borderRadius: RADIUS.md, marginTop: 8 },
  anssiText: { color: "#fff", fontSize: 12, fontWeight: "700", flex: 1 },

  btnDeclare: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", padding: 12, borderRadius: RADIUS.md, marginTop: 12 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  accessCard: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  accessTotal: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 6 },
  byRole: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  byRoleText: { fontSize: 11, color: COLORS.textSecondary, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#F3F4F6", borderRadius: 999 },

  docLink: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  docEmoji: { fontSize: 18 },
  docTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
});
