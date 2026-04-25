import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const { width } = Dimensions.get("window");

export default function FoetusWeekScreen() {
  const router = useRouter();
  const { sa: saParam } = useLocalSearchParams<{ sa?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentSa, setCurrentSa] = useState<number>(saParam ? parseInt(saParam) : 12);

  const load = useCallback(async (sa: number) => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/foetus/${sa}`);
      setData(d);
      setCurrentSa(sa);
    } catch (e) {
      try {
        const { data: d } = await api.get("/foetus");
        setData(d);
        setCurrentSa(d.current_sa || 12);
      } catch (e2: any) {
        // fallback: rester sur la SA demandée
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (saParam) load(parseInt(saParam));
    else {
      // tente de récupérer la SA actuelle
      api.get("/foetus").then((r) => {
        setData(r.data);
        setCurrentSa(r.data.current_sa || 12);
        setLoading(false);
      }).catch(() => load(12));
    }
  }, [saParam, load]);

  const goPrev = () => { if (currentSa > 4) load(currentSa - 1); };
  const goNext = () => { if (currentSa < 41) load(currentSa + 1); };

  if (loading || !data) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  }

  const trimestre = currentSa < 14 ? 1 : currentSa < 28 ? 2 : 3;
  const trimestreColor = trimestre === 1 ? "#F472B6" : trimestre === 2 ? "#A855F7" : "#06B6D4";
  const progress = ((currentSa - 4) / (41 - 4)) * 100;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={[trimestreColor, "#FB7185"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mon bébé semaine par semaine</Text>
          <Text style={styles.headerSub}>Trimestre {trimestre} · {currentSa} SA</Text>
        </View>
      </LinearGradient>

      {/* Progression */}
      <View style={styles.progressWrap}>
        <View style={[styles.progressBar, { width: `${progress}%`, backgroundColor: trimestreColor }]} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {/* Navigation flèches */}
        <View style={styles.navRow}>
          <TouchableOpacity onPress={goPrev} disabled={currentSa <= 4} style={[styles.navBtn, currentSa <= 4 && styles.navBtnDisabled]} testID="foetus-prev">
            <Ionicons name="chevron-back" size={22} color={currentSa <= 4 ? COLORS.textMuted : COLORS.primary} />
            <Text style={[styles.navBtnText, currentSa <= 4 && { color: COLORS.textMuted }]}>SA {currentSa - 1}</Text>
          </TouchableOpacity>
          <View style={styles.weekChip}>
            <Text style={styles.weekChipText}>Semaine {currentSa}</Text>
          </View>
          <TouchableOpacity onPress={goNext} disabled={currentSa >= 41} style={[styles.navBtn, currentSa >= 41 && styles.navBtnDisabled]} testID="foetus-next">
            <Text style={[styles.navBtnText, currentSa >= 41 && { color: COLORS.textMuted }]}>SA {currentSa + 1}</Text>
            <Ionicons name="chevron-forward" size={22} color={currentSa >= 41 ? COLORS.textMuted : COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Carte fruit */}
        <LinearGradient colors={["#FFF1F2", "#FCE7F3"]} style={styles.fruitCard}>
          <Text style={styles.fruitEmoji}>{getFruitEmoji(data.fruit)}</Text>
          <Text style={styles.fruitTitle}>{data.title}</Text>
          <Text style={styles.fruitName}>Comme un(e) {data.fruit}</Text>
          <View style={styles.fruitStats}>
            <View style={styles.fruitStat}>
              <Ionicons name="resize-outline" size={16} color="#9F1239" />
              <Text style={styles.fruitStatText}>{data.taille}</Text>
            </View>
            {data.poids !== "—" && (
              <View style={styles.fruitStat}>
                <Ionicons name="scale-outline" size={16} color="#9F1239" />
                <Text style={styles.fruitStatText}>{data.poids}</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* Highlights */}
        <Text style={styles.sectionTitle}>✨ Cette semaine, votre bébé</Text>
        {(data.highlights || []).map((h: string, i: number) => (
          <View key={i} style={styles.highlightRow}>
            <View style={[styles.bullet, { backgroundColor: trimestreColor }]} />
            <Text style={styles.highlightText}>{h}</Text>
          </View>
        ))}

        {/* Conseil */}
        <View style={styles.conseilCard}>
          <View style={styles.conseilHead}>
            <Ionicons name="bulb" size={20} color="#D97706" />
            <Text style={styles.conseilTitle}>Conseil de la semaine</Text>
          </View>
          <Text style={styles.conseilText}>{data.conseil}</Text>
        </View>

        {/* Quick jump */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>📅 Aller à une semaine</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
          {Array.from({ length: 41 - 4 + 1 }, (_, i) => i + 4).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => load(s)}
              style={[styles.weekDot, s === currentSa && { backgroundColor: trimestreColor, borderColor: trimestreColor }]}
              testID={`week-${s}`}
            >
              <Text style={[styles.weekDotText, s === currentSa && { color: "#fff" }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function getFruitEmoji(fruit: string): string {
  const f = fruit.toLowerCase();
  if (f.includes("sésame")) return "🌱";
  if (f.includes("poivre")) return "🌶️";
  if (f.includes("pois") || f.includes("haricot")) return "🟢";
  if (f.includes("myrtille")) return "🫐";
  if (f.includes("cerise")) return "🍒";
  if (f.includes("fraise")) return "🍓";
  if (f.includes("citron")) return "🍋";
  if (f.includes("prune")) return "🟣";
  if (f.includes("pêche") || f.includes("pomme")) return "🍑";
  if (f.includes("poire")) return "🍐";
  if (f.includes("avocat")) return "🥑";
  if (f.includes("oignon")) return "🧅";
  if (f.includes("patate") || f.includes("igname")) return "🍠";
  if (f.includes("mangue")) return "🥭";
  if (f.includes("banane")) return "🍌";
  if (f.includes("carotte")) return "🥕";
  if (f.includes("courge") || f.includes("courgette")) return "🥒";
  if (f.includes("aubergine")) return "🍆";
  if (f.includes("maïs")) return "🌽";
  if (f.includes("chou")) return "🥬";
  if (f.includes("brocoli")) return "🥦";
  if (f.includes("ananas")) return "🍍";
  if (f.includes("noix de coco")) return "🥥";
  if (f.includes("citrouille")) return "🎃";
  if (f.includes("melon") || f.includes("pastèque")) return "🍉";
  if (f.includes("salade") || f.includes("laitue")) return "🥗";
  return "👶";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  progressWrap: { height: 4, backgroundColor: "#FCE7F3", marginHorizontal: SPACING.xl, marginTop: 12, borderRadius: 2, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 2 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 12 },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 8 },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  weekChip: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  weekChipText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  fruitCard: { padding: 24, borderRadius: RADIUS.lg, alignItems: "center", marginTop: 10, ...SHADOW.sm },
  fruitEmoji: { fontSize: 80, marginBottom: 8 },
  fruitTitle: { fontSize: 22, fontWeight: "800", color: "#9F1239", textAlign: "center" },
  fruitName: { fontSize: 13, color: "#BE123C", marginTop: 4, fontStyle: "italic" },
  fruitStats: { flexDirection: "row", gap: 14, marginTop: 14 },
  fruitStat: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  fruitStatText: { fontSize: 13, fontWeight: "700", color: "#9F1239" },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15, marginTop: 20, marginBottom: 10 },
  highlightRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  bullet: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  highlightText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
  conseilCard: { backgroundColor: "#FEF3C7", padding: 14, borderRadius: RADIUS.md, marginTop: 16, borderWidth: 1, borderColor: "#FCD34D" },
  conseilHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  conseilTitle: { fontWeight: "800", color: "#92400E", fontSize: 14 },
  conseilText: { color: "#78350F", fontSize: 13, lineHeight: 18 },
  weekDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  weekDotText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
});
