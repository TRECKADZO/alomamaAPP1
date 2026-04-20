import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { COLORS, IMAGES, RADIUS, SHADOW, SPACING } from "../../constants/theme";

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      if (user?.role === "maman") {
        const [g, enfants, rdv, rem] = await Promise.all([
          api.get("/grossesse").catch(() => ({ data: null })),
          api.get("/enfants").catch(() => ({ data: [] })),
          api.get("/rdv").catch(() => ({ data: [] })),
          api.get("/reminders").catch(() => ({ data: [] })),
        ]);
        setData({ grossesse: g.data, enfants: enfants.data, rdv: rdv.data, reminders: rem.data });
      } else if (user?.role === "professionnel") {
        const [patients, rdv] = await Promise.all([
          api.get("/pro/patients").catch(() => ({ data: [] })),
          api.get("/rdv").catch(() => ({ data: [] })),
        ]);
        setData({ patients: patients.data, rdv: rdv.data });
      } else if (user?.role === "admin") {
        const stats = await api.get("/admin/stats").catch(() => ({ data: {} }));
        setData({ stats: stats.data });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Bonjour 👋</Text>
            <Text style={styles.name} testID="dashboard-name">{user?.name}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/notifications")}
              testID="notif-btn"
            >
              <Ionicons name="notifications-outline" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatar}
              onPress={() => router.push("/(tabs)/profil")}
              testID="avatar-btn"
            >
              <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {user?.role === "maman" && <MamanDash data={data} router={router} />}
        {user?.role === "professionnel" && <ProDash data={data} router={router} />}
        {user?.role === "admin" && <AdminDash data={data} router={router} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function MamanDash({ data, router }: any) {
  const g = data.grossesse;
  const enfants = data.enfants || [];
  const rdv = (data.rdv || []).filter((r: any) => r.status !== "termine").slice(0, 2);
  const reminders = (data.reminders || []).filter((r: any) => !r.done).slice(0, 3);

  const weeksRaw = g?.date_debut ? Math.floor((Date.now() - new Date(g.date_debut).getTime()) / (7 * 24 * 3600 * 1000)) : 0;
  const weeks = Math.min(Math.max(weeksRaw, 0), 40);

  return (
    <View style={styles.body}>
      {/* Hero pregnancy card */}
      <View style={styles.heroCard} testID="hero-card">
        <Image source={{ uri: IMAGES.heroMaman }} style={styles.heroImg} />
        <View style={styles.heroOverlay} />
        <View style={styles.heroContent}>
          {g ? (
            <>
              <Text style={styles.heroLabel}>GROSSESSE EN COURS</Text>
              <Text style={styles.heroTitle}>Semaine {weeks}</Text>
              <Text style={styles.heroSub}>{g.notes || "Votre bébé grandit chaque jour 💛"}</Text>
              <TouchableOpacity style={styles.heroBtn} onPress={() => router.push("/(tabs)/grossesse")}>
                <Text style={styles.heroBtnText}>Voir le suivi</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.heroLabel}>BIENVENUE</Text>
              <Text style={styles.heroTitle}>Votre santé compte</Text>
              <Text style={styles.heroSub}>Démarrez votre suivi grossesse</Text>
              <TouchableOpacity
                style={styles.heroBtn}
                onPress={() => router.push("/(tabs)/grossesse")}
                testID="start-grossesse-btn"
              >
                <Text style={styles.heroBtnText}>Démarrer</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Accès rapide</Text>
      <View style={styles.quickGrid}>
        <QuickAction icon="calendar" label="RDV" onPress={() => router.push("/(tabs)/rdv")} testID="qa-rdv" />
        <QuickAction icon="sparkles" label="Assistant IA" onPress={() => router.push("/(tabs)/assistant")} testID="qa-ia" color={COLORS.accent} />
        <QuickAction icon="people" label="Enfants" onPress={() => router.push("/(tabs)/enfants")} testID="qa-enfants" color={COLORS.secondary} />
        <QuickAction icon="chatbubbles" label="Communauté" onPress={() => router.push("/(tabs)/communaute")} testID="qa-com" />
        <QuickAction icon="flower" label="Cycle" onPress={() => router.push("/cycle")} testID="qa-cycle" color="#E11D48" />
        <QuickAction icon="shield-checkmark" label="Contracep." onPress={() => router.push("/contraception")} testID="qa-contra" color={COLORS.accent} />
        <QuickAction icon="heart-circle" label="Post-partum" onPress={() => router.push("/post-partum")} testID="qa-postpartum" color={COLORS.secondary} />
        <QuickAction icon="search" label="Rechercher" onPress={() => router.push("/search")} testID="qa-search" />
      </View>

      {/* Rappels */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mes rappels</Text>
          <TouchableOpacity onPress={() => router.push("/reminders")} testID="view-reminders">
            <Text style={styles.linkText}>Voir tout</Text>
          </TouchableOpacity>
        </View>
        {reminders.length === 0 ? (
          <Text style={styles.empty}>Aucun rappel actif</Text>
        ) : (
          reminders.map((r: any) => (
            <View key={r.id} style={styles.listRow}>
              <View style={styles.listIcon}>
                <Ionicons name="alarm" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{r.title}</Text>
                <Text style={styles.listSub}>{new Date(r.due_at).toLocaleDateString("fr-FR")}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* RDV prochains */}
      <View style={styles.cardSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Prochains rendez-vous</Text>
        </View>
        {rdv.length === 0 ? (
          <Text style={styles.empty}>Aucun rendez-vous à venir</Text>
        ) : (
          rdv.map((r: any) => (
            <View key={r.id} style={styles.listRow}>
              <View style={[styles.listIcon, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="medical" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{r.pro_name}</Text>
                <Text style={styles.listSub}>{r.motif} · {new Date(r.date).toLocaleDateString("fr-FR")}</Text>
              </View>
              <Text style={[styles.badge, { backgroundColor: r.status === "confirme" ? COLORS.secondaryLight : "#FFF3E0" }]}>
                {r.status}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Enfants count */}
      {enfants.length > 0 && (
        <View style={styles.cardSection}>
          <Text style={styles.sectionTitle}>Mes enfants ({enfants.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {enfants.map((e: any) => (
              <TouchableOpacity
                key={e.id}
                style={styles.childChip}
                onPress={() => router.push("/(tabs)/enfants")}
              >
                <Text style={styles.childEmoji}>{e.sexe === "F" ? "👧" : "👦"}</Text>
                <Text style={styles.childName}>{e.nom}</Text>
                <Text style={styles.childAge}>
                  {Math.floor((Date.now() - new Date(e.date_naissance).getTime()) / (365 * 24 * 3600 * 1000))} an(s)
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function ProDash({ data, router }: any) {
  const patients = data.patients || [];
  const rdvToday = (data.rdv || []).filter((r: any) => {
    const d = new Date(r.date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  return (
    <View style={styles.body}>
      <View style={styles.heroCard}>
        <Image source={{ uri: IMAGES.heroDoctor }} style={styles.heroImg} />
        <View style={styles.heroOverlay} />
        <View style={styles.heroContent}>
          <Text style={styles.heroLabel}>ESPACE PROFESSIONNEL</Text>
          <Text style={styles.heroTitle}>Bienvenue Dr.</Text>
          <Text style={styles.heroSub}>Gérez vos patientes et vos rendez-vous</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{patients.length}</Text>
          <Text style={styles.metricLabel}>Patientes</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{(data.rdv || []).length}</Text>
          <Text style={styles.metricLabel}>RDV Total</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{rdvToday.length}</Text>
          <Text style={styles.metricLabel}>Aujourd'hui</Text>
        </View>
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>RDV du jour</Text>
        {rdvToday.length === 0 ? (
          <Text style={styles.empty}>Aucun RDV aujourd'hui</Text>
        ) : (
          rdvToday.map((r: any) => (
            <View key={r.id} style={styles.listRow}>
              <View style={styles.listIcon}>
                <Ionicons name="time" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{r.maman_name}</Text>
                <Text style={styles.listSub}>{r.motif} · {new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: COLORS.primary, marginTop: 16 }]}
        onPress={() => router.push("/(tabs)/patients")}
      >
        <Text style={styles.btnText}>Voir mes patientes</Text>
      </TouchableOpacity>
    </View>
  );
}

function AdminDash({ data, router }: any) {
  const s = data.stats || {};
  return (
    <View style={styles.body}>
      <View style={styles.heroCard}>
        <View style={[styles.heroImg, { backgroundColor: COLORS.primary }]} />
        <View style={styles.heroContent}>
          <Text style={[styles.heroLabel, { color: "#FFE7E0" }]}>CONSOLE ADMIN</Text>
          <Text style={[styles.heroTitle, { color: "#fff" }]}>À lo Maman</Text>
          <Text style={[styles.heroSub, { color: "#FFD5CB" }]}>Vue d'ensemble de la plateforme</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Statistiques</Text>
      <View style={styles.statGrid}>
        <StatCard icon="people" label="Utilisateurs" value={s.users ?? 0} color={COLORS.primary} />
        <StatCard icon="heart" label="Mamans" value={s.mamans ?? 0} color={COLORS.accent} />
        <StatCard icon="medkit" label="Professionnels" value={s.professionnels ?? 0} color={COLORS.secondary} />
        <StatCard icon="calendar" label="RDV" value={s.rdv ?? 0} color={COLORS.primary} />
        <StatCard icon="happy" label="Enfants" value={s.enfants ?? 0} color={COLORS.accent} />
        <StatCard icon="chatbubbles" label="Posts" value={s.posts ?? 0} color={COLORS.secondary} />
      </View>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: COLORS.primary, marginTop: 16 }]}
        onPress={() => router.push("/(tabs)/admin")}
      >
        <Text style={styles.btnText}>Gérer les utilisateurs</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, testID, color = COLORS.primary }: any) {
  return (
    <TouchableOpacity style={styles.qa} onPress={onPress} testID={testID}>
      <View style={[styles.qaIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    padding: SPACING.xl,
    paddingBottom: SPACING.md,
    justifyContent: "space-between",
    alignItems: "center",
  },
  hello: { color: COLORS.textSecondary, fontSize: 14 },
  name: { color: COLORS.textPrimary, fontSize: 22, fontWeight: "800", marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  body: { padding: SPACING.xl, paddingTop: 0, gap: SPACING.lg },
  heroCard: {
    height: 190,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    position: "relative",
    ...SHADOW,
  },
  heroImg: { ...StyleSheet.absoluteFillObject as any, width: "100%", height: "100%" },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(45,51,47,0.45)",
  },
  heroContent: { flex: 1, padding: SPACING.lg, justifyContent: "flex-end" },
  heroLabel: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "800" },
  heroSub: { color: "#fff", fontSize: 13, opacity: 0.9, marginTop: 4, marginBottom: 12 },
  heroBtn: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  heroBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  linkText: { color: COLORS.primary, fontWeight: "600", fontSize: 13 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  qa: {
    width: "23%",
    alignItems: "center",
    gap: 6,
  },
  qaIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  qaLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "600", textAlign: "center" },
  cardSection: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.secondaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  listTitle: { color: COLORS.textPrimary, fontWeight: "600" },
  listSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  badge: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    color: COLORS.textPrimary,
    textTransform: "uppercase",
  },
  empty: { color: COLORS.textMuted, textAlign: "center", paddingVertical: 20, fontStyle: "italic" },
  childChip: {
    backgroundColor: COLORS.secondaryLight,
    borderRadius: RADIUS.lg,
    padding: 12,
    alignItems: "center",
    marginRight: 10,
    minWidth: 90,
  },
  childEmoji: { fontSize: 32 },
  childName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13, marginTop: 4 },
  childAge: { color: COLORS.textSecondary, fontSize: 11 },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricValue: { fontSize: 24, fontWeight: "800", color: COLORS.primary },
  metricLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  btn: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
});
