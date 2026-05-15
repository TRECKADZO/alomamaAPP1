import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function CPN() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/grossesse-plus/cpn").then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!data) return <SafeAreaView style={s.loader}><Text>Aucune donnée</Text></SafeAreaView>;

  const cw = data.current_week || 0;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {data.next && (
          <View style={s.nextCard}>
            <Text style={s.nextLbl}>PROCHAINE ÉTAPE</Text>
            <Text style={s.nextTitle}>{data.next.title}</Text>
            <Text style={s.nextWeek}>SA {data.next.week} • dans {data.next.week - cw} semaine{data.next.week - cw > 1 ? "s" : ""}</Text>
            <Text style={s.nextAdvice}>{data.next.advice}</Text>
            <TouchableOpacity style={s.bookBtn} onPress={() => router.push("/(tabs)/rdv")}>
              <Ionicons name="calendar" size={18} color="#fff" />
              <Text style={s.bookTxt}>Prendre rendez-vous</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.title}>Calendrier de suivi prénatal</Text>
        {(data.schedule || []).map((c: any) => {
          const past = c.week <= cw;
          return (
            <View key={c.week} style={[s.item, past && s.itemDone]}>
              <View style={[s.dot, past && s.dotDone]}>
                {past ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={s.dotTxt}>{c.week}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.itemTitle, past && s.itemTitleDone]}>{c.title}</Text>
                <Text style={s.itemAdvice}>{c.advice}</Text>
              </View>
              {c.important && !past && <View style={s.imp}><Text style={s.impTxt}>!</Text></View>}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  nextCard: { padding: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, marginBottom: 16 },
  nextLbl: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  nextTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4 },
  nextWeek: { color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 10 },
  nextAdvice: { color: "#fff", lineHeight: 19, fontSize: 13 },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: RADIUS.pill },
  bookTxt: { color: "#fff", fontWeight: "800" },
  title: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16, marginBottom: 12 },
  item: { flexDirection: "row", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, alignItems: "center" },
  itemDone: { backgroundColor: COLORS.bgSecondary, opacity: 0.7 },
  dot: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: COLORS.success },
  dotTxt: { color: COLORS.primary, fontWeight: "800", fontSize: 13 },
  itemTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  itemTitleDone: { textDecorationLine: "line-through", color: COLORS.textMuted },
  itemAdvice: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  imp: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.warning, alignItems: "center", justifyContent: "center" },
  impTxt: { color: "#fff", fontWeight: "800" },
});
