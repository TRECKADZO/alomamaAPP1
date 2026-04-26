import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const ROLES = [
  { value: "tous", label: "Tous", icon: "people" as const, color: COLORS.primary },
  { value: "maman", label: "Mamans", icon: "heart" as const, color: "#EC4899" },
  { value: "professionnel", label: "Pros", icon: "medkit" as const, color: "#0EA5E9" },
  { value: "centre_sante", label: "Centres", icon: "business" as const, color: "#A855F7" },
  { value: "famille", label: "Famille", icon: "people-circle" as const, color: "#F59E0B" },
  { value: "admin", label: "Admin", icon: "shield" as const, color: "#059669" },
];

export default function Annuaire() {
  const router = useRouter();
  const [role, setRole] = useState("tous");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const off = reset ? 0 : offset;
      const params = new URLSearchParams();
      if (role !== "tous") params.set("role", role);
      if (q.trim()) params.set("q", q.trim());
      params.set("limit", String(limit));
      params.set("offset", String(off));
      const r = await api.get(`/admin/directory?${params.toString()}`);
      setItems(reset ? r.data.items : [...items, ...r.data.items]);
      setTotal(r.data.total);
      setOffset(off + r.data.items.length);
    } finally {
      setLoading(false);
    }
  }, [role, q, offset, items]);

  useEffect(() => {
    setItems([]);
    setOffset(0);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Annuaire utilisateurs</Text>
          <Text style={styles.sub}>{total} résultats</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher (nom, email, tél, spécialité, ville)..."
          placeholderTextColor={COLORS.textMuted}
          onSubmitEditing={() => load(true)}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {q ? (
          <TouchableOpacity onPress={() => { setQ(""); setTimeout(() => load(true), 100); }}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.tab, role === r.value && { backgroundColor: r.color, borderColor: r.color }]}
            onPress={() => setRole(r.value)}
          >
            <Ionicons name={r.icon} size={14} color={role === r.value ? "#fff" : r.color} />
            <Text style={[styles.tabText, role === r.value && { color: "#fff" }]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0 }}
        renderItem={({ item }) => <UserCard item={item} onPress={() => router.push(`/admin/user/${item.id}`)} />}
        onEndReached={() => offset < total && !loading && load(false)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Aucun utilisateur</Text> : null}
        ListFooterComponent={loading ? <ActivityIndicator color={COLORS.primary} style={{ margin: 20 }} /> : null}
      />
    </SafeAreaView>
  );
}

function UserCard({ item, onPress }: { item: any; onPress: () => void }) {
  const role = ROLES.find((r) => r.value === item.role) || ROLES[0];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: role.color }]}>
        <Text style={styles.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={styles.name}>{item.name || "Sans nom"}</Text>
          <View style={[styles.roleBadge, { backgroundColor: role.color + "22" }]}>
            <Ionicons name={role.icon} size={10} color={role.color} />
            <Text style={[styles.roleBadgeText, { color: role.color }]}>{role.label}</Text>
          </View>
          {item.premium ? <View style={styles.premiumBadge}><Text style={styles.premiumText}>PREMIUM</Text></View> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {item.email_public || item.email}{item.phone ? ` · ${item.phone}` : ""}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.specialite ? `🩺 ${item.specialite}` : ""}{item.ville ? ` · 📍 ${item.ville}` : ""}
        </Text>
        {item._stats && Object.keys(item._stats).length > 0 ? (
          <View style={styles.statsRow}>
            {Object.entries(item._stats).map(([k, v]) => (
              <View key={k} style={styles.stat}>
                <Text style={styles.statValue}>{typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}</Text>
                <Text style={styles.statLabel}>{k.replace(/_/g, " ")}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, paddingBottom: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, height: 46, marginHorizontal: SPACING.xl, marginBottom: 10 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },

  tabs: { gap: 6, paddingHorizontal: SPACING.xl, paddingBottom: 12 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },

  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  name: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  roleBadgeText: { fontSize: 9, fontWeight: "800" },
  premiumBadge: { backgroundColor: "#F59E0B", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 },
  premiumText: { fontSize: 9, fontWeight: "800", color: "#fff" },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 6 },
  stat: { alignItems: "flex-start" },
  statValue: { fontSize: 13, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 9, color: COLORS.textMuted, textTransform: "uppercase" },

  empty: { textAlign: "center", color: COLORS.textMuted, padding: 30, fontStyle: "italic" },
});
