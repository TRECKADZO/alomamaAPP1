/**
 * 📜 Pro — Historique de toutes mes notes médicales écrites
 *    Filtre par statut (lues / non lues), recherche par patient, tri par date.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

type Filter = "all" | "read" | "unread";

export default function ProMesNotesEcrites() {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/pro/mes-notes-ecrites");
      setNotes(r.data || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = useMemo(() => {
    let f = notes;
    if (filter === "read") f = f.filter((n) => n.read_by_maman);
    if (filter === "unread") f = f.filter((n) => !n.read_by_maman);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      f = f.filter((n) =>
        (n.concerne || "").toLowerCase().includes(q) ||
        (n.diagnostic || "").toLowerCase().includes(q) ||
        (n.traitement || "").toLowerCase().includes(q),
      );
    }
    return f;
  }, [notes, filter, search]);

  const unreadCount = notes.filter((n) => !n.read_by_maman).length;
  const totalCount = notes.length;

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📜 Mes notes médicales</Text>
          <Text style={styles.sub}>{totalCount} note{totalCount > 1 ? "s" : ""} écrite{totalCount > 1 ? "s" : ""} · {unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Text>
        </View>
      </View>

      {/* Recherche */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par patient, diagnostic…"
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres */}
      <View style={styles.filterRow}>
        {(["all", "unread", "read"] as Filter[]).map((f) => {
          const active = filter === f;
          const label = f === "all" ? "Toutes" : f === "unread" ? "Non lues" : "Lues";
          const count = f === "all" ? totalCount : f === "unread" ? unreadCount : totalCount - unreadCount;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune note</Text>
            <Text style={styles.emptyText}>
              {search || filter !== "all"
                ? "Aucune note ne correspond à votre filtre."
                : "Ajoutez votre 1ʳᵉ note médicale depuis le dossier d'une patiente."}
            </Text>
          </View>
        ) : filtered.map((n) => {
          const isEnfant = !!n.enfant_id;
          return (
            <View key={n.id} style={[styles.card, isEnfant && { borderLeftWidth: 4, borderLeftColor: "#EC4899" }]}>
              <View style={styles.cardHead}>
                <View style={[styles.avatar, { backgroundColor: isEnfant ? "#FCE7F3" : "#DBEAFE" }]}>
                  <Text style={styles.avatarTxt}>{isEnfant ? "👶" : "👩"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.concerne}>{n.concerne}</Text>
                  <Text style={styles.typeLabel}>
                    {isEnfant ? `Note pédiatrique · ${n.maman_nom ? "Maman: " + n.maman_nom : ""}` : "Note maman"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.status, n.read_by_maman ? styles.statusRead : styles.statusUnread]}>
                    <Ionicons
                      name={n.read_by_maman ? "checkmark-done" : "ellipse"}
                      size={10}
                      color={n.read_by_maman ? "#10B981" : "#EF4444"}
                    />
                    <Text style={[styles.statusText, { color: n.read_by_maman ? "#10B981" : "#EF4444" }]}>
                      {n.read_by_maman ? "Lue" : "Non lue"}
                    </Text>
                  </View>
                  <Text style={styles.date}>{(n.date || n.created_at) ? new Date(n.date || n.created_at).toLocaleDateString("fr-FR") : ""}</Text>
                </View>
              </View>

              {n.diagnostic ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Diagnostic</Text>
                  <Text style={styles.fieldText} numberOfLines={2}>{n.diagnostic}</Text>
                </View>
              ) : null}
              {n.traitement ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Traitement</Text>
                  <Text style={styles.fieldText} numberOfLines={2}>{n.traitement}</Text>
                </View>
              ) : null}
              {n.attachment_base64 ? (
                <View style={styles.attachTag}>
                  <Ionicons name="document-attach" size={12} color="#EC4899" />
                  <Text style={styles.attachText}>{n.attachment_name || "Pièce jointe"}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, marginRight: 10 },
  title: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: SPACING.lg, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.textPrimary, padding: 0 },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: SPACING.lg, marginBottom: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  filterChipActive: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  filterText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "800" },
  filterTextActive: { color: "#fff" },

  empty: { padding: 40, alignItems: "center", marginTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 18 },

  card: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 20 },
  concerne: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  typeLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  date: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },

  status: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusRead: { backgroundColor: "#D1FAE5" },
  statusUnread: { backgroundColor: "#FEE2E2" },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },

  field: { marginBottom: 6 },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: "#EC4899", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldText: { fontSize: 12, color: COLORS.textPrimary, marginTop: 2 },

  attachTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#FCE7F3", borderRadius: 999, alignSelf: "flex-start", marginTop: 4 },
  attachText: { fontSize: 11, color: "#9D174D", fontWeight: "700" },
});
