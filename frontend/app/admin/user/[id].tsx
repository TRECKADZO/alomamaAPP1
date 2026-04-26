import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../../constants/theme";

export default function UserDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await api.get(`/admin/directory/${id}`);
      setData(r.data);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, [id]));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.loading}><Text>Introuvable</Text></SafeAreaView>;

  const u = data.user || {};
  const stats = data.stats || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Fiche utilisateur</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(u.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{u.name}</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{(u.role || "").toUpperCase()}</Text></View>
          <Text style={styles.metaLine}>✉ {u.email}</Text>
          {u.phone ? <Text style={styles.metaLine}>☎ {u.phone}</Text> : null}
          {u.specialite ? <Text style={styles.metaLine}>🩺 {u.specialite}</Text> : null}
          {u.ville ? <Text style={styles.metaLine}>📍 {u.ville}</Text> : null}
          {u.created_at ? <Text style={styles.metaLine}>📅 Inscrit le {new Date(u.created_at).toLocaleDateString("fr-FR")}</Text> : null}
          {u.premium ? <View style={[styles.badge, { backgroundColor: "#F59E0B", marginTop: 8 }]}><Text style={[styles.badgeText, { color: "#fff" }]}>PREMIUM</Text></View> : null}
        </View>

        <Text style={styles.sectionTitle}>📊 Statistiques</Text>
        <View style={styles.statsGrid}>
          {Object.entries(stats).map(([k, v]) => (
            <View key={k} style={styles.statCard}>
              <Text style={styles.statValue}>{typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}</Text>
              <Text style={styles.statLabel}>{k.replace(/_/g, " ")}</Text>
            </View>
          ))}
        </View>

        {data.recent && Object.keys(data.recent).length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>🕒 Activité récente</Text>
            {Object.entries(data.recent).map(([k, list]: any) => (
              <View key={k} style={styles.recentBlock}>
                <Text style={styles.recentTitle}>{k.replace(/_/g, " ").toUpperCase()} ({(list as any[]).length})</Text>
                {(list as any[]).slice(0, 5).map((row, i) => (
                  <View key={i} style={styles.recentRow}>
                    <Text style={styles.recentText} numberOfLines={2}>
                      {Object.values(row).filter((v) => typeof v === "string" || typeof v === "number").slice(0, 4).join(" · ")}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, paddingBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 20, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  badge: { backgroundColor: COLORS.primaryLight, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: "800", color: COLORS.primary, letterSpacing: 1 },
  metaLine: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12, marginBottom: 8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { width: "48.5%", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 22, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, textTransform: "uppercase", marginTop: 2 },

  recentBlock: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  recentTitle: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, marginBottom: 8, letterSpacing: 0.5 },
  recentRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recentText: { fontSize: 12, color: COLORS.textPrimary },
});
