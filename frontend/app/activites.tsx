import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

export default function ActivitesScreen() {
  const router = useRouter();
  const [tranches, setTranches] = useState<any[]>([]);
  const [enfants, setEnfants] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/activites").then((r) => r.data.tranches || []),
      api.get("/enfants").then((r) => r.data || []).catch(() => []),
    ]).then(([t, e]) => {
      setTranches(t);
      setEnfants(e);
      // sélectionner la tranche du 1er enfant
      if (e.length > 0 && t.length > 0) {
        const m = Math.floor((Date.now() - new Date(e[0].date_naissance).getTime()) / (30.4375 * 86400000));
        const idx = t.findIndex((tr: any) => m >= tr.age_min && m < tr.age_max);
        if (idx >= 0) setActiveIdx(idx);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const t = tranches[activeIdx] || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#06B6D4"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎮 Activités & jeux</Text>
          <Text style={styles.sub}>Idées low-cost adaptées par âge</Text>
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tranches.map((tr, i) => (
          <TouchableOpacity key={i} onPress={() => setActiveIdx(i)} style={[styles.tab, i === activeIdx && styles.tabActive]} testID={`age-tab-${i}`}>
            <Text style={[styles.tabText, i === activeIdx && styles.tabTextActive]}>{tr.title.split(" — ")[0]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 60 }}>
        <View style={styles.titleCard}>
          <Ionicons name="happy-outline" size={28} color="#10B981" />
          <Text style={styles.cardTitle}>{t.title}</Text>
        </View>

        {(t.categories || []).map((cat: any, i: number) => (
          <View key={i} style={styles.catBox}>
            <Text style={styles.catName}>{cat.nom}</Text>
            {cat.items.map((it: string, j: number) => (
              <View key={j} style={styles.itemRow}>
                <Text style={styles.bullet}>🔸</Text>
                <Text style={styles.itemText}>{it}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.tipsCard}>
          <Ionicons name="bulb" size={18} color="#92400E" />
          <Text style={styles.tipsText}>
            💡 Astuce : pas besoin de jouets coûteux. Cuillère en bois, bouchons, cartons, branches… Les meilleurs jouets sont autour de vous !
          </Text>
        </View>
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
  tabs: { padding: SPACING.xl, gap: 6, paddingBottom: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: "#10B981", borderColor: "#10B981" },
  tabText: { fontWeight: "700", fontSize: 12, color: COLORS.textPrimary },
  tabTextActive: { color: "#fff" },
  titleCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: "#ECFDF5", borderRadius: RADIUS.lg, marginBottom: 14, borderWidth: 1, borderColor: "#A7F3D0" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#065F46", flex: 1 },
  catBox: { backgroundColor: COLORS.surface, padding: 14, borderRadius: RADIUS.md, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  catName: { fontWeight: "800", color: "#10B981", fontSize: 14, marginBottom: 8 },
  itemRow: { flexDirection: "row", gap: 8, paddingVertical: 5 },
  bullet: { fontSize: 14 },
  itemText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
  tipsCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, marginTop: 14, borderWidth: 1, borderColor: "#FCD34D" },
  tipsText: { flex: 1, color: "#78350F", fontSize: 12, lineHeight: 17 },
});
