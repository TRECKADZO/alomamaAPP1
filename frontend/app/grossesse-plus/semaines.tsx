import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const TRIM_BG = ["#FCE7F3", "#EDE9FE", "#DBEAFE"];
const TRIM_COLOR = ["#EC4899", "#8B5CF6", "#3B82F6"];
const TRIM_TITLE = ["1er trimestre", "2e trimestre", "3e trimestre"];

export default function Semaines() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/grossesse-plus/weeks").then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const grouped: Record<number, any[]> = {};
  items.forEach(it => { (grouped[it.trimester] = grouped[it.trimester] || []).push(it); });

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {[1, 2, 3].map(t => (
          <View key={t} style={{ marginBottom: 20 }}>
            <View style={s.trimHead}>
              <View style={[s.trimDot, { backgroundColor: TRIM_COLOR[t - 1] }]} />
              <Text style={s.trimTitle}>{TRIM_TITLE[t - 1]}</Text>
              <Text style={s.trimRange}>SA {grouped[t]?.[0]?.week} → {grouped[t]?.[grouped[t].length - 1]?.week}</Text>
            </View>
            <View style={s.grid}>
              {(grouped[t] || []).map(w => (
                <TouchableOpacity key={w.week} style={[s.card, { backgroundColor: TRIM_BG[t - 1] }]} onPress={() => router.push(`/grossesse-plus/semaine/${w.week}` as any)}>
                  <Text style={s.cardEmoji}>{w.emoji}</Text>
                  <Text style={s.cardWeek}>SA {w.week}</Text>
                  <Text style={s.cardFruit} numberOfLines={1}>{w.fruit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  trimHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  trimDot: { width: 8, height: 8, borderRadius: 4 },
  trimTitle: { flex: 1, fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  trimRange: { color: COLORS.textMuted, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "22.5%", padding: 10, borderRadius: RADIUS.md, alignItems: "center", flexGrow: 1 },
  cardEmoji: { fontSize: 26 },
  cardWeek: { fontSize: 11, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  cardFruit: { fontSize: 10, color: COLORS.textSecondary, textAlign: "center", marginTop: 2 },
});
