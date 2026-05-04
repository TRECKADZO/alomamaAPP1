/**
 * Tab "Patientes" — visible uniquement pour le rôle CENTRE_SANTE.
 * Liste les patientes (mamans) suivies par les pros membres du centre,
 * dédupliquées, avec messaging signals (unread, last_message…).
 */
import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  TextInput, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function CentrePatientes() {
  const router = useRouter();
  const { user } = useAuth();
  const [patientes, setPatientes] = useState<any[]>([]);
  const [pros, setPros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "grossesse" | "enfants" | "unread">("all");

  const isCentre = user?.role === "centre_sante";

  const load = async () => {
    if (!isCentre) return;
    try {
      const { data } = await api.get("/centre/contacts");
      setPatientes(data?.patientes || []);
      setPros(data?.pros || []);
    } catch (e) {
      console.warn("Load patientes centre failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = patientes.filter((p: any) => {
    const matchQ = !q.trim()
      || (p.name || "").toLowerCase().includes(q.toLowerCase())
      || (p.phone || "").includes(q)
      || (p.email || "").toLowerCase().includes(q.toLowerCase());
    const matchFilter =
      filter === "all"
        ? true
        : filter === "grossesse"
          ? !!p.has_grossesse
          : filter === "enfants"
            ? (p.enfants_count || 0) > 0
            : filter === "unread"
              ? (p.unread_count || 0) > 0
              : true;
    return matchQ && matchFilter;
  });

  const totalUnread = patientes.reduce((sum, p) => sum + (p.unread_count || 0), 0);
  const totalGrossesse = patientes.filter((p) => p.has_grossesse).length;
  const totalAvecEnfants = patientes.filter((p) => (p.enfants_count || 0) > 0).length;

  if (!isCentre) {
    // Sécurité : seul un centre doit accéder
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ textAlign: "center", marginTop: 40, color: COLORS.textMuted }}>
          Cette page est réservée aux centres de santé.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#FCE7F3", "#FBCFE8"]} style={styles.heroBg}>
        <Text style={styles.title}>Patientes du centre</Text>
        <Text style={styles.subtitle}>
          {patientes.length} patiente{patientes.length > 1 ? "s" : ""} suivie{patientes.length > 1 ? "s" : ""}
          {pros.length > 0 ? ` par ${pros.length} pro${pros.length > 1 ? "s" : ""}` : ""}
        </Text>

        {/* Stats compacts */}
        <View style={styles.statsRow}>
          <Stat icon="heart" value={totalGrossesse} label="Grossesses" color="#EC4899" />
          <Stat icon="happy" value={totalAvecEnfants} label="Avec enfants" color="#3B82F6" />
          <Stat icon="mail-unread" value={totalUnread} label="Non lus" color="#EF4444" />
        </View>
      </LinearGradient>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher par nom, téléphone, email…"
          placeholderTextColor={COLORS.textMuted}
          testID="patientes-search-input"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <FilterChip label="Toutes" active={filter === "all"} onPress={() => setFilter("all")} count={patientes.length} />
        <FilterChip label="Grossesse" active={filter === "grossesse"} onPress={() => setFilter("grossesse")} count={totalGrossesse} icon="heart" color="#EC4899" />
        <FilterChip label="Avec enfants" active={filter === "enfants"} onPress={() => setFilter("enfants")} count={totalAvecEnfants} icon="happy" color="#3B82F6" />
        {totalUnread > 0 && (
          <FilterChip label="Non lus" active={filter === "unread"} onPress={() => setFilter("unread")} count={totalUnread} icon="mail-unread" color="#EF4444" />
        )}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.primary}
          />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={56} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>
              {q || filter !== "all" ? "Aucun résultat" : "Aucune patiente"}
            </Text>
            <Text style={styles.emptyText}>
              {q || filter !== "all"
                ? "Essayez un autre filtre ou recherche."
                : "Les patientes des pros membres de votre centre apparaîtront ici dès qu'ils auront pris RDV."}
            </Text>
          </View>
        ) : (
          filtered.map((p) => {
            const hasUnread = (p.unread_count || 0) > 0;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.card, hasUnread && styles.cardUnread]}
                onPress={() => router.push(`/chat/${p.id}?name=${encodeURIComponent(p.name || "")}`)}
                activeOpacity={0.7}
                testID={`patiente-${p.id}`}
              >
                <LinearGradient colors={["#EC4899", "#DB2777"]} style={styles.avatar}>
                  <Text style={styles.avatarText}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
                  {hasUnread && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{p.unread_count > 9 ? "9+" : p.unread_count}</Text>
                    </View>
                  )}
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, hasUnread && { color: "#EC4899" }]}>{p.name}</Text>
                  {p.last_message ? (
                    <Text
                      style={[styles.preview, hasUnread && { fontWeight: "800", color: COLORS.textPrimary }]}
                      numberOfLines={1}
                    >
                      {p.last_message_from_me ? "Vous : " : ""}{p.last_message}
                    </Text>
                  ) : (
                    <Text style={styles.preview} numberOfLines={1}>{p.phone || p.email || "—"}</Text>
                  )}
                  <View style={styles.badgesRow}>
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
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.iconBtn, hasUnread && styles.iconBtnActive]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/chat/${p.id}?name=${encodeURIComponent(p.name || "")}`);
                  }}
                  testID={`msg-patiente-${p.id}`}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color={hasUnread ? "#fff" : "#EC4899"} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, value, label, color }: any) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}33` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress, count, icon, color }: any) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        active && { backgroundColor: color || COLORS.primary, borderColor: color || COLORS.primary },
      ]}
      onPress={onPress}
    >
      {icon && <Ionicons name={icon} size={12} color={active ? "#fff" : (color || COLORS.textMuted)} />}
      <Text style={[styles.filterChipText, active && { color: "#fff" }]}>{label}</Text>
      {typeof count === "number" && (
        <View style={[styles.filterCount, active && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
          <Text style={[styles.filterCountText, active && { color: "#fff" }]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },

  heroBg: { padding: SPACING.xl, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: "800", color: "#831843" },
  subtitle: { fontSize: 12, color: "#9F1239", marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  statCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 10 },
  statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, lineHeight: 18 },
  statLabel: { fontSize: 9, color: COLORS.textSecondary },

  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: SPACING.lg, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary, padding: 0 },

  filterRow: { paddingHorizontal: SPACING.lg, paddingVertical: 10, gap: 8, flexDirection: "row" },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  filterCount: { backgroundColor: COLORS.primaryLight, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
  filterCountText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },

  body: { paddingHorizontal: SPACING.lg, paddingBottom: 30 },

  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  cardUnread: { borderColor: "#EC4899", borderWidth: 1.5, backgroundColor: "#FDF2F8" },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", position: "relative" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  unreadBadge: { position: "absolute", top: -2, right: -2, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderWidth: 2, borderColor: "#fff" },
  unreadBadgeText: { color: "#fff", fontWeight: "800", fontSize: 10 },

  name: { fontWeight: "700", fontSize: 15, color: COLORS.textPrimary },
  preview: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  badgesRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "700" },

  iconBtn: { width: 38, height: 38, backgroundColor: "#FCE7F3", borderRadius: 19, alignItems: "center", justifyContent: "center" },
  iconBtnActive: { backgroundColor: "#EC4899" },

  empty: { alignItems: "center", padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
