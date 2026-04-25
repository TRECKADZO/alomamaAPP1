import { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function GlossaireScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/glossaire").then((r) => { setItems(r.data.items || []); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const ql = q.toLowerCase();
    return items.filter((i) => i.terme.toLowerCase().includes(ql) || i.definition.toLowerCase().includes(ql));
  }, [items, q]);

  // Group by 1st letter
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach((i) => {
      const l = i.terme.charAt(0).toUpperCase();
      if (!map[l]) map[l] = [];
      map[l].push(i);
    });
    return Object.keys(map).sort().map((l) => ({ letter: l, items: map[l] }));
  }, [filtered]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#6366F1", "#A855F7"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📖 Glossaire médical</Text>
          <Text style={styles.sub}>{filtered.length} termes expliqués simplement</Text>
        </View>
      </LinearGradient>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un terme..."
          placeholderTextColor={COLORS.textMuted}
          testID="search-glossaire"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")}><Ionicons name="close-circle" size={18} color={COLORS.textMuted} /></TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 60 }}>
        {grouped.length === 0 ? (
          <Text style={styles.empty}>Aucun résultat pour "{q}"</Text>
        ) : (
          grouped.map((g) => (
            <View key={g.letter}>
              <Text style={styles.letter}>{g.letter}</Text>
              {g.items.map((it: any) => {
                const isOpen = expanded[it.terme];
                return (
                  <TouchableOpacity
                    key={it.terme}
                    onPress={() => setExpanded((s) => ({ ...s, [it.terme]: !s[it.terme] }))}
                    style={styles.item}
                    testID={`term-${it.terme}`}
                  >
                    <View style={styles.itemHead}>
                      <Text style={styles.terme}>{it.terme}</Text>
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.primary} />
                    </View>
                    {isOpen && <Text style={styles.def}>{it.definition}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: SPACING.xl, marginVertical: 14, paddingHorizontal: 14, height: 44, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  search: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 30, fontStyle: "italic" },
  letter: { fontSize: 22, fontWeight: "800", color: "#6366F1", marginTop: 16, marginBottom: 6 },
  item: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  terme: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  def: { color: COLORS.textPrimary, fontSize: 13, marginTop: 8, lineHeight: 18 },
});
