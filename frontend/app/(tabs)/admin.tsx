import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Admin() {
  const [stats, setStats] = useState<any>({});
  const [payStats, setPayStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [s, u, p] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users"),
        api.get("/pay/admin/stats").catch(() => ({ data: {} })),
      ]);
      setStats(s.data);
      setUsers(u.data);
      setPayStats(p.data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const roleColor: any = {
    maman: COLORS.primary,
    professionnel: COLORS.secondary,
    admin: COLORS.accent,
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <Text style={styles.title}>Console Admin</Text>
        <Text style={styles.subtitle}>Vue d'ensemble de la plateforme À lo Maman</Text>

        <View style={styles.grid}>
          <StatCard icon="people" label="Utilisateurs" value={stats.users ?? 0} color={COLORS.primary} />
          <StatCard icon="heart" label="Mamans" value={stats.mamans ?? 0} color={COLORS.primary} />
          <StatCard icon="medkit" label="Pros" value={stats.professionnels ?? 0} color={COLORS.secondary} />
          <StatCard icon="calendar" label="RDV" value={stats.rdv ?? 0} color={COLORS.accent} />
          <StatCard icon="happy" label="Enfants" value={stats.enfants ?? 0} color={COLORS.accent} />
          <StatCard icon="chatbubbles" label="Posts" value={stats.posts ?? 0} color={COLORS.secondary} />
          <StatCard icon="mail" label="Messages" value={stats.messages ?? 0} color={COLORS.primary} />
        </View>

        <Text style={styles.sectionTitle}>💰 Revenus plateforme</Text>
        <View style={styles.revCard}>
          <View style={styles.revRow}>
            <Text style={styles.revLabel}>Revenus totaux</Text>
            <Text style={styles.revValue}>{(payStats.total_revenu_fcfa ?? 0).toLocaleString()} FCFA</Text>
          </View>
          <View style={styles.revRow}>
            <Text style={styles.revLabel}>Commission plateforme</Text>
            <Text style={[styles.revValue, { color: COLORS.success }]}>{(payStats.total_commission_plateforme ?? 0).toLocaleString()} F</Text>
          </View>
          <View style={styles.revRow}>
            <Text style={styles.revLabel}>Reversé aux pros</Text>
            <Text style={styles.revValue}>{(payStats.total_reverse_pros ?? 0).toLocaleString()} F</Text>
          </View>
          <View style={styles.revRow}>
            <Text style={styles.revLabel}>Paiements complétés</Text>
            <Text style={styles.revValue}>{payStats.nb_paiements ?? 0}</Text>
          </View>
          <View style={styles.revRow}>
            <Text style={styles.revLabel}>Abonnements actifs</Text>
            <Text style={styles.revValue}>{payStats.nb_abonnements ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Utilisateurs ({users.length})</Text>        {users.map((u) => (
          <View key={u.id} style={styles.userRow}>
            <View style={[styles.avatar, { backgroundColor: roleColor[u.role] || COLORS.primary }]}>
              <Text style={styles.avatarText}>{u.name?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.name}</Text>
              <Text style={styles.userEmail}>{u.email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: (roleColor[u.role] || COLORS.primary) + "22" }]}>
              <Text style={[styles.roleBadgeText, { color: roleColor[u.role] || COLORS.primary }]}>{u.role}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { color: COLORS.textSecondary, marginTop: 4, marginBottom: SPACING.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: SPACING.xl },
  statCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, marginTop: 6 },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 10 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  userName: { fontWeight: "700", color: COLORS.textPrimary },
  userEmail: { color: COLORS.textSecondary, fontSize: 12 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  roleBadgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  revCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.xl },
  revRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  revLabel: { color: COLORS.textSecondary, fontSize: 13 },
  revValue: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 15 },
});
