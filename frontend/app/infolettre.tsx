import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const TYPE_META: Record<string, { color: [string, string]; icon: string }> = {
  foetus:           { color: ["#F472B6", "#FB7185"], icon: "heart" },
  jalon:            { color: ["#10B981", "#0EA5E9"], icon: "checkmark-done" },
  diversification:  { color: ["#F59E0B", "#FB923C"], icon: "restaurant" },
};

export default function InfolettreScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data: d } = await api.get("/infolettre");
      setData(d);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;

  const items: any[] = data?.items || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#7C3AED", "#A855F7"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📰 Mon infolettre</Text>
          <Text style={styles.sub}>Contenu personnalisé pour vous cette semaine</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hello */}
        <View style={styles.helloBox}>
          <Text style={styles.helloEmoji}>👋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.helloTitle}>Bonjour {data?.subscriber_name || "Maman"} !</Text>
            <Text style={styles.helloText}>Voici ce qui compte pour vous et votre famille cette semaine.</Text>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              Pas encore de contenu personnalisé. Ajoutez votre grossesse ou vos enfants pour recevoir des conseils adaptés.
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/grossesse")} style={styles.btnAdd}>
              <Text style={styles.btnAddText}>Ajouter ma grossesse</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((item, i) => {
            const meta = TYPE_META[item.type] || TYPE_META.foetus;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => item.link && router.push(item.link)}
                style={styles.itemCard}
                testID={`infoletter-${item.type}-${i}`}
              >
                <LinearGradient colors={meta.color as any} style={styles.itemHeader}>
                  <Ionicons name={meta.icon as any} size={20} color="#fff" />
                  <Text style={styles.itemHeaderText}>{item.title}</Text>
                </LinearGradient>
                <View style={styles.itemBody}>
                  {item.fruit && (
                    <Text style={styles.itemFruit}>🌱 Comme un(e) {item.fruit} · {item.taille}</Text>
                  )}
                  {item.etape && (
                    <Text style={styles.itemEtape}>{item.etape}</Text>
                  )}
                  {(item.highlights || []).map((h: string, j: number) => (
                    <View key={j} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: meta.color[0] }]} />
                      <Text style={styles.bulletText}>{h}</Text>
                    </View>
                  ))}
                  {(item.alerte || []).length > 0 && (
                    <View style={styles.alerteBox}>
                      <Ionicons name="alert-circle" size={14} color="#DC2626" />
                      <Text style={styles.alerteText}>Signes à surveiller : {item.alerte.join(", ")}</Text>
                    </View>
                  )}
                  {item.conseil && (
                    <View style={styles.conseilBox}>
                      <Ionicons name="bulb" size={14} color="#92400E" />
                      <Text style={styles.conseilText}>{item.conseil}</Text>
                    </View>
                  )}
                  {item.tips && (
                    <View style={styles.conseilBox}>
                      <Ionicons name="bulb" size={14} color="#92400E" />
                      <Text style={styles.conseilText}>{item.tips}</Text>
                    </View>
                  )}
                  {item.cta && (
                    <View style={[styles.cta, { backgroundColor: meta.color[0] + "22" }]}>
                      <Text style={[styles.ctaText, { color: meta.color[0] }]}>{item.cta} →</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.footer}>
          🔄 Tirez vers le bas pour rafraîchir. Le contenu s'adapte automatiquement à votre grossesse et l'âge de vos enfants.
        </Text>
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
  helloBox: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#F5F3FF", borderRadius: RADIUS.lg, marginBottom: 16, borderWidth: 1, borderColor: "#DDD6FE" },
  helloEmoji: { fontSize: 32 },
  helloTitle: { fontWeight: "800", color: "#5B21B6", fontSize: 15 },
  helloText: { color: "#6D28D9", fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.textSecondary, marginTop: 10, marginBottom: 16, textAlign: "center", lineHeight: 18 },
  btnAdd: { backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  btnAddText: { color: "#fff", fontWeight: "800" },
  itemCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  itemHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  itemHeaderText: { flex: 1, color: "#fff", fontWeight: "800", fontSize: 14 },
  itemBody: { padding: 14 },
  itemFruit: { color: COLORS.textSecondary, fontSize: 12, fontStyle: "italic", marginBottom: 8 },
  itemEtape: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginVertical: 4 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  bulletText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
  alerteBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", padding: 8, backgroundColor: "#FEF2F2", borderRadius: 8, marginTop: 8 },
  alerteText: { flex: 1, color: "#991B1B", fontSize: 11, lineHeight: 14 },
  conseilBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", padding: 8, backgroundColor: "#FEF3C7", borderRadius: 8, marginTop: 8 },
  conseilText: { flex: 1, color: "#78350F", fontSize: 11, lineHeight: 14 },
  cta: { padding: 8, borderRadius: 8, marginTop: 10, alignItems: "center" },
  ctaText: { fontWeight: "800", fontSize: 12 },
  footer: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 20 },
});
