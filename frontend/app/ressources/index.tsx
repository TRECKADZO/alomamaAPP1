import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const CATS = [
  { value: "toutes", label: "Toutes", icon: "apps", color: "#6B7280" },
  { value: "grossesse", label: "Grossesse", icon: "heart", color: "#EC4899" },
  { value: "accouchement", label: "Accouchement", icon: "medkit", color: "#A855F7" },
  { value: "allaitement", label: "Allaitement", icon: "water", color: "#F59E0B" },
  { value: "post_partum", label: "Post-partum", icon: "happy", color: "#F472B6" },
  { value: "nutrition", label: "Nutrition", icon: "nutrition", color: "#10B981" },
  { value: "vaccination", label: "Vaccination", icon: "shield-checkmark", color: "#3B82F6" },
  { value: "sante_enfant", label: "Santé enfant", icon: "body", color: "#06B6D4" },
  { value: "planification_familiale", label: "Planif. familiale", icon: "calendar", color: "#8B5CF6" },
  { value: "hygiene", label: "Hygiène", icon: "sparkles", color: "#14B8A6" },
];

const TYPES = [
  { value: "", label: "Tous", icon: "layers" },
  { value: "video", label: "Vidéos", icon: "play-circle" },
  { value: "fiche", label: "Fiches", icon: "document-text" },
  { value: "quiz", label: "Quiz", icon: "help-circle" },
];

export default function RessourcesIndex() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [type, setType] = useState("");
  const [cat, setCat] = useState("toutes");
  const [q, setQ] = useState("");

  const load = async () => {
    try {
      const params: any = {};
      if (type) params.type = type;
      if (cat && cat !== "toutes") params.category = cat;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/resources", { params });
      setItems(data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [type, cat]));

  const onRefresh = () => { setRefreshing(true); load(); };
  const search = () => { setLoading(true); load(); };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Ressources éducatives</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <LinearGradient colors={["#10B981", "#059669"]} style={styles.hero}>
          <Ionicons name="school" size={28} color="#fff" />
          <Text style={styles.heroTitle}>Apprenez à votre rythme</Text>
          <Text style={styles.heroSub}>Vidéos, fiches pratiques et quiz validés OMS · UNICEF · MSHP-CI</Text>
        </LinearGradient>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={search}
            placeholder="Rechercher une ressource…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            testID="ressource-search"
          />
          {q ? (
            <TouchableOpacity onPress={() => { setQ(""); setTimeout(search, 0); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
          {TYPES.map((t) => {
            const active = type === t.value;
            return (
              <TouchableOpacity key={t.value || "all"} style={[styles.pill, active && styles.pillActive]} onPress={() => setType(t.value)} testID={`type-${t.value || 'all'}`}>
                <Ionicons name={t.icon as any} size={14} color={active ? "#fff" : COLORS.textSecondary} />
                <Text style={[styles.pillText, active && { color: "#fff" }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionLabel}>Catégories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
          {CATS.map((c) => {
            const active = cat === c.value;
            return (
              <TouchableOpacity key={c.value} style={[styles.pill, active && { backgroundColor: c.color, borderColor: c.color }]} onPress={() => setCat(c.value)} testID={`cat-${c.value}`}>
                <Ionicons name={c.icon as any} size={14} color={active ? "#fff" : c.color} />
                <Text style={[styles.pillText, active && { color: "#fff" }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucune ressource trouvée</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((r) => <ResourceCard key={r.id} r={r} onPress={() => router.push(`/ressources/${r.id}`)} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResourceCard({ r, onPress }: { r: any; onPress: () => void }) {
  const typeIcon = r.type === "video" ? "play-circle" : r.type === "quiz" ? "help-circle" : "document-text";
  const typeColor = r.type === "video" ? "#DC2626" : r.type === "quiz" ? "#7C3AED" : "#059669";
  const cat = CATS.find((c) => c.value === r.category);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} testID={`resource-${r.id}`}>
      <View style={[styles.typeIcon, { backgroundColor: typeColor }]}>
        <Ionicons name={typeIcon as any} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>{r.title}</Text>
        {r.description ? <Text style={styles.cardDesc} numberOfLines={2}>{r.description}</Text> : null}
        <View style={styles.cardMeta}>
          {cat && (
            <View style={[styles.catBadge, { backgroundColor: (cat.color || "#6B7280") + "22" }]}>
              <Ionicons name={cat.icon as any} size={10} color={cat.color} />
              <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.label}</Text>
            </View>
          )}
          {r.source ? <Text style={styles.sourceTxt}>{r.source}</Text> : null}
          {r.views ? <Text style={styles.viewsTxt}>• {r.views} vue{r.views > 1 ? "s" : ""}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  hero: { margin: SPACING.lg, padding: 18, borderRadius: RADIUS.lg, alignItems: "center", gap: 4 },
  heroTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 6 },
  heroSub: { color: "rgba(255,255,255,0.92)", fontSize: 12, textAlign: "center" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: SPACING.lg, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },

  sectionLabel: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, marginHorizontal: SPACING.lg, marginTop: 14, marginBottom: 6, textTransform: "uppercase" },
  pillsRow: { paddingHorizontal: SPACING.lg, paddingVertical: 4, gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, marginRight: 6 },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },

  list: { paddingHorizontal: SPACING.lg, marginTop: 8, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  typeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  cardDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, lineHeight: 16 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  catBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  catBadgeText: { fontSize: 10, fontWeight: "800" },
  sourceTxt: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted },
  viewsTxt: { fontSize: 10, color: COLORS.textMuted },

  empty: { alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
});
