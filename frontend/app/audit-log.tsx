/**
 * Audit Log — Maman voit qui a accédé à ses données et quand.
 * Route: /audit-log
 */
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

type Event = {
  id?: string;
  user_id: string;
  user_role: string;
  user_name: string;
  action: string; // read | write | delete | export
  resource_type: string;
  resource_id: string;
  details?: any;
  timestamp: string;
};

const ACTION_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  read: { label: "Consultation", color: "#3B82F6", emoji: "👁️" },
  write: { label: "Modification", color: "#F59E0B", emoji: "✏️" },
  delete: { label: "Suppression", color: "#EF4444", emoji: "🗑️" },
  export: { label: "Export", color: "#10B981", emoji: "📤" },
};

const RESOURCE_LABELS: Record<string, string> = {
  Patient: "Profil patient",
  Immunization: "Vaccins",
  Observation: "Mesures (poids, taille…)",
  DiagnosticReport: "Examens / Échographies",
  Composition: "Carnet médical",
  "Carnet.module": "Carnet (module)",
  "Carnet.pdf": "Carnet PDF",
  "Bundle.everything": "Bundle FHIR complet",
  Consent: "Consentement",
};

export default function AuditLog() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    try {
      const r = await api.get("/audit-log/me?limit=200");
      setEvents(r.data.events || []);
    } catch (e: any) {
      console.error("Audit load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = events.filter((e) => {
    if (filter === "all") return true;
    return e.action === filter;
  });

  // Group by day
  const grouped: Record<string, Event[]> = {};
  filtered.forEach((e) => {
    const d = new Date(e.timestamp);
    const key = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  const stats = {
    total: events.length,
    read: events.filter((e) => e.action === "read").length,
    write: events.filter((e) => e.action === "write").length,
    export: events.filter((e) => e.action === "export").length,
    delete: events.filter((e) => e.action === "delete").length,
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#6366F1", "#3B82F6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🔍 Journal d'audit</Text>
          <Text style={styles.sub}>{stats.total} accès enregistrés</Text>
        </View>
      </LinearGradient>

      {/* Stats cards */}
      <View style={styles.statsRow}>
        <Stat label="Consultations" value={stats.read} color="#3B82F6" emoji="👁️" />
        <Stat label="Modifications" value={stats.write} color="#F59E0B" emoji="✏️" />
        <Stat label="Exports" value={stats.export} color="#10B981" emoji="📤" />
      </View>

      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <Filter label="Tout" emoji="" active={filter === "all"} onPress={() => setFilter("all")} />
        <Filter label="Consultations" emoji="👁️" active={filter === "read"} onPress={() => setFilter("read")} />
        <Filter label="Modifications" emoji="✏️" active={filter === "write"} onPress={() => setFilter("write")} />
        <Filter label="Exports" emoji="📤" active={filter === "export"} onPress={() => setFilter("export")} />
        <Filter label="Suppressions" emoji="🗑️" active={filter === "delete"} onPress={() => setFilter("delete")} />
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>📭</Text>
            <Text style={styles.emptyTitle}>Aucun événement</Text>
            <Text style={styles.emptySub}>Personne n'a encore consulté vos données médicales.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([day, items]) => (
            <View key={day} style={{ marginBottom: 18 }}>
              <Text style={styles.dayTitle}>{day}</Text>
              {items.map((e, i) => {
                const action = ACTION_LABELS[e.action] || { label: e.action, color: COLORS.textMuted, emoji: "•" };
                const resource = RESOURCE_LABELS[e.resource_type] || e.resource_type;
                const dt = new Date(e.timestamp);
                const time = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                return (
                  <View key={`${day}-${i}`} style={styles.eventCard}>
                    <View style={[styles.eventLeft, { backgroundColor: `${action.color}1F` }]}>
                      <Text style={{ fontSize: 18 }}>{action.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.eventTop}>
                        <Text style={styles.eventAction}>{action.label}</Text>
                        <Text style={styles.eventTime}>{time}</Text>
                      </View>
                      <Text style={styles.eventResource}>{resource}</Text>
                      <View style={styles.eventBy}>
                        <Ionicons name="person-circle" size={12} color={COLORS.textMuted} />
                        <Text style={styles.eventByText}>
                          {e.user_name || "—"}
                          {e.user_role === "professionnel" ? " · Pro" : e.user_role === "maman" ? " · Vous" : ` · ${e.user_role}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color, emoji }: any) {
  return (
    <View style={[styles.stat, { borderLeftColor: color }]}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={[styles.statNum, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Filter({ label, emoji, active, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.filterBtn, active && styles.filterBtnActive]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{emoji} {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 8, padding: SPACING.lg, paddingBottom: 8 },
  stat: { flex: 1, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 3, ...SHADOW },
  statEmoji: { fontSize: 16 },
  statNum: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  filterRow: { paddingHorizontal: SPACING.lg, paddingBottom: 8, gap: 6 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  filterText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  filterTextActive: { color: "#fff" },

  dayTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textMuted, marginBottom: 8, textTransform: "capitalize" },

  eventCard: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  eventLeft: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eventAction: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  eventTime: { fontSize: 11, color: COLORS.textMuted },
  eventResource: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  eventBy: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  eventByText: { fontSize: 11, color: COLORS.textMuted },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8 },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 4 },
});
