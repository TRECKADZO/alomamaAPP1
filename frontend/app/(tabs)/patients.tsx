import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function Patients() {
  const router = useRouter();
  const { user } = useAuth();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/pro/patients");
      setPatients(data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = patients.filter((p) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const grossessesActives = patients.filter((p) => p.has_grossesse).length;
  const totalEnfants = patients.reduce((s, p) => s + (p.enfants_count || 0), 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const isCentre = user?.role === "centre_sante";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header gradient */}
      <LinearGradient colors={isCentre ? ["#A855F7", "#6366F1"] : ["#2DD4BF", "#06B6D4"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {isCentre ? "Mes professionnels" : "Mes patientes"}
            </Text>
            <Text style={styles.headerSub}>
              {isCentre ? "Gérez les pros de votre centre" : "Suivez vos patientes"}
            </Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{patients.length}</Text>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.8)" />
          <TextInput
            style={styles.search}
            placeholder="Rechercher une patiente..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </LinearGradient>

      {/* Stats + Actions */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: "#EC4899" }]}>{grossessesActives}</Text>
          <Text style={styles.statLabel}>Grossesses</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: "#3B82F6" }]}>{totalEnfants}</Text>
          <Text style={styles.statLabel}>Enfants</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: "#A855F7" }]}>{patients.length}</Text>
          <Text style={styles.statLabel}>Patientes</Text>
        </View>
      </View>

      {!isCentre && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 100 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 10, gap: 8 }}>
          <Action icon="calendar" label="Disponibilités" color="#2DD4BF" onPress={() => router.push("/pro/disponibilites")} />
          <Action icon="alarm" label="Rappels" color="#F59E0B" onPress={() => router.push("/pro/rappels")} />
          <Action icon="sparkles" label="IA Pro" color="#A855F7" onPress={() => router.push("/pro/ia")} />
          <Action icon="videocam" label="Téléconsult." color="#06B6D4" onPress={() => router.push("/(tabs)/rdv")} />
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingTop: 4, paddingBottom: 60 }}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune patiente</Text>
            <Text style={styles.emptyText}>{isCentre ? "Invitez des professionnels via le code de votre centre" : "Les patientes prenant RDV avec vous apparaîtront ici."}</Text>
          </View>
        ) : (
          filtered.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.card}
              onPress={() => router.push(`/pro/dossier/${p.id}`)}
              testID={`patient-card-${p.id}`}
            >
              <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name?.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{p.email}</Text>
                <View style={styles.badges}>
                  {p.has_grossesse && (
                    <View style={[styles.badge, { backgroundColor: "#FCE7F3" }]}>
                      <Ionicons name="heart" size={10} color="#BE185D" />
                      <Text style={[styles.badgeText, { color: "#BE185D" }]}>{p.grossesse_sa || "?"} SA</Text>
                    </View>
                  )}
                  {p.enfants_count > 0 && (
                    <View style={[styles.badge, { backgroundColor: "#DBEAFE" }]}>
                      <Ionicons name="happy" size={10} color="#1D4ED8" />
                      <Text style={[styles.badgeText, { color: "#1D4ED8" }]}>{p.enfants_count} enfant{p.enfants_count > 1 ? "s" : ""}</Text>
                    </View>
                  )}
                  {p.last_rdv_date && (
                    <View style={[styles.badge, { backgroundColor: "#F3E8FF" }]}>
                      <Ionicons name="calendar" size={10} color="#7E22CE" />
                      <Text style={[styles.badgeText, { color: "#7E22CE" }]}>Dernier: {new Date(p.last_rdv_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => router.push(`/chat/${p.id}?name=${encodeURIComponent(p.name)}`)}
                  testID={`msg-patient-${p.id}`}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ icon, label, color, onPress }: any) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  headerBadge: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.pill },
  headerBadgeText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: RADIUS.pill, paddingHorizontal: 14, height: 40 },
  search: { flex: 1, color: "#fff", fontSize: 14 },

  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: SPACING.lg, marginTop: -12 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  statVal: { fontWeight: "800", fontSize: 22 },
  statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

  action: { alignItems: "center", gap: 4, width: 88 },
  actionIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "700", textAlign: "center" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  name: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  meta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  badgeText: { fontSize: 10, fontWeight: "800" },
  iconBtn: { width: 36, height: 36, backgroundColor: COLORS.primaryLight, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
});
