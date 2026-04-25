import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

export default function DiversificationScreen() {
  const router = useRouter();
  const [etapes, setEtapes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enfants, setEnfants] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get("/diversification").then((r) => r.data.etapes || []),
      api.get("/enfants").then((r) => r.data || []).catch(() => []),
    ]).then(([d, e]) => {
      setEtapes(d);
      setEnfants(e);
      // si un enfant a entre 6 et 24 mois, présélectionner son étape
      const enfantConcerne = e.find((x: any) => {
        try {
          const m = Math.floor((Date.now() - new Date(x.date_naissance).getTime()) / (30.4375 * 86400000));
          return m >= 6 && m <= 24;
        } catch { return false; }
      });
      if (enfantConcerne) {
        const m = Math.floor((Date.now() - new Date(enfantConcerne.date_naissance).getTime()) / (30.4375 * 86400000));
        const idx = d.findIndex((s: any) => m >= s.age_min && m <= s.age_max);
        if (idx >= 0) setActiveIdx(idx);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;

  const e = etapes[activeIdx] || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#F59E0B", "#FB923C"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🍼 Diversification alimentaire</Text>
          <Text style={styles.sub}>Calendrier adapté Afrique de l'Ouest</Text>
        </View>
      </LinearGradient>

      {/* Tabs étapes */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {etapes.map((s, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setActiveIdx(i)}
            style={[styles.tab, i === activeIdx && styles.tabActive]}
            testID={`step-${i}`}
          >
            <Text style={[styles.tabText, i === activeIdx && styles.tabTextActive]}>{s.etape}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 60 }}>
        {/* Card intro */}
        <LinearGradient colors={["#FEF3C7", "#FFEDD5"]} style={styles.introCard}>
          <Text style={styles.introTitle}>{e.title}</Text>
          <Text style={styles.introText}>{e.intro}</Text>
          {e.tetee && (
            <View style={styles.tetee}>
              <Ionicons name="water" size={14} color="#9F1239" />
              <Text style={styles.teteeText}>{e.tetee}</Text>
            </View>
          )}
        </LinearGradient>

        {/* Repas type */}
        <Text style={styles.sectionTitle}>📅 Une journée type</Text>
        {(e.repas || []).map((r: any, i: number) => (
          <View key={i} style={styles.repasRow}>
            <View style={styles.repasMoment}>
              <Text style={styles.repasMomentText}>{r.moment}</Text>
            </View>
            <Text style={styles.repasMenu}>{r.menu}</Text>
          </View>
        ))}

        {/* Aliments OK */}
        <Text style={styles.sectionTitle}>✅ Aliments à introduire</Text>
        <View style={styles.tagBox}>
          {(e.aliments_ok || []).map((a: string, i: number) => (
            <View key={i} style={styles.tagOk}><Text style={styles.tagOkText}>{a}</Text></View>
          ))}
        </View>

        {/* Aliments à éviter */}
        <Text style={styles.sectionTitle}>⛔ À éviter ou attendre</Text>
        <View style={styles.tagBox}>
          {(e.aliments_eviter || []).map((a: string, i: number) => (
            <View key={i} style={styles.tagBad}><Text style={styles.tagBadText}>{a}</Text></View>
          ))}
        </View>

        {/* Tips */}
        {e.tips && (
          <View style={styles.tipsCard}>
            <Ionicons name="bulb" size={18} color="#92400E" />
            <Text style={styles.tipsText}>{e.tips}</Text>
          </View>
        )}

        {/* Quick links */}
        <Text style={styles.sectionTitle}>📌 Aller à</Text>
        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => router.push("/(tabs)/enfants")} style={styles.linkBtn}>
            <Ionicons name="happy" size={16} color={COLORS.primary} />
            <Text style={styles.linkBtnText}>Voir mes enfants</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/jalons")} style={styles.linkBtn}>
            <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
            <Text style={styles.linkBtnText}>Étapes développement</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  tabs: { paddingHorizontal: SPACING.xl, paddingVertical: 12, gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: "#F59E0B", borderColor: "#F59E0B" },
  tabText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  introCard: { padding: 16, borderRadius: RADIUS.lg, marginBottom: 14, ...SHADOW.sm },
  introTitle: { fontSize: 18, fontWeight: "800", color: "#92400E" },
  introText: { color: "#78350F", marginTop: 6, fontSize: 13, lineHeight: 18 },
  tetee: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.5)", borderRadius: 999, alignSelf: "flex-start" },
  teteeText: { fontSize: 12, fontWeight: "700", color: "#9F1239" },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginTop: 16, marginBottom: 8 },
  repasRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  repasMoment: { backgroundColor: "#FED7AA", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, minWidth: 80 },
  repasMomentText: { color: "#9A3412", fontWeight: "800", fontSize: 11, textAlign: "center" },
  repasMenu: { flex: 1, color: COLORS.textPrimary, fontSize: 12, lineHeight: 16 },
  tagBox: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagOk: { backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#86EFAC" },
  tagOkText: { color: "#15803D", fontSize: 11, fontWeight: "700" },
  tagBad: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#FCA5A5" },
  tagBadText: { color: "#991B1B", fontSize: 11, fontWeight: "700" },
  tipsCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, marginTop: 14, borderWidth: 1, borderColor: "#FCD34D" },
  tipsText: { flex: 1, color: "#78350F", fontSize: 12, lineHeight: 17 },
  linkRow: { flexDirection: "row", gap: 8 },
  linkBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  linkBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
});
