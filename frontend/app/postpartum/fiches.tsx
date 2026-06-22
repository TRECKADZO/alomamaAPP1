/**
 * Parcours libre des 52 fiches éducatives post-partum.
 * Accessible sans setup (mode découverte).
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

type Fiche = { week: number; title: string; tip: string };

export default function FichesPostpartum() {
  const [items, setItems] = useState<Fiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<Fiche[]>("/postpartum/fiches");
        setItems(r.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  // Regroupement par périodes
  const groups: { label: string; emoji: string; weeks: Fiche[] }[] = [
    { label: "Premier mois — soins immédiats", emoji: "🌱", weeks: items.filter(i => i.week <= 4) },
    { label: "Mois 2-3 — récupération", emoji: "💚", weeks: items.filter(i => i.week > 4 && i.week <= 12) },
    { label: "Mois 4-6 — retour à l'équilibre", emoji: "🌸", weeks: items.filter(i => i.week > 12 && i.week <= 26) },
    { label: "Mois 7-12 — vie de famille", emoji: "🦋", weeks: items.filter(i => i.week > 26) },
  ];

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.intro}>
          <Text style={s.introTitle}>📚 {items.length} fiches éducatives</Text>
          <Text style={s.introTxt}>Pour comprendre, anticiper, déculpabiliser. Accessible à toutes — futures mamans, jeunes mamans, proches.</Text>
        </View>

        {groups.map((g, gi) => g.weeks.length > 0 && (
          <View key={gi} style={s.group}>
            <Text style={s.groupTitle}>{g.emoji} {g.label}</Text>
            {g.weeks.map(f => {
              const isOpen = open === f.week;
              return (
                <TouchableOpacity key={f.week} style={s.card} onPress={() => setOpen(isOpen ? null : f.week)} activeOpacity={0.7}>
                  <View style={s.cardHead}>
                    <View style={s.weekBadge}>
                      <Text style={s.weekBadgeTxt}>S{f.week}</Text>
                    </View>
                    <Text style={s.cardTitle}>{f.title}</Text>
                    <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
                  </View>
                  {isOpen && (
                    <Text style={s.cardTip}>{f.tip}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={s.disclaimer}>
          <Ionicons name="information-circle" size={18} color="#831843" />
          <Text style={s.disclaimerTxt}>
            Ces conseils complètent — mais ne remplacent jamais — l'avis de votre sage-femme ou médecin. En cas de doute, consultez.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FDF2F8" },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  intro: { padding: SPACING.lg, backgroundColor: "#fff", borderRadius: RADIUS.lg, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: "#EC4899" },
  introTitle: { fontWeight: "800", fontSize: 17, color: COLORS.textPrimary, marginBottom: 6 },
  introTxt: { color: COLORS.textSecondary, lineHeight: 19, fontSize: 13 },
  group: { marginBottom: 18 },
  groupTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, fontSize: 14, paddingHorizontal: 4 },
  card: { padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.md, marginBottom: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  weekBadge: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: "#FCE7F3", borderRadius: 6, minWidth: 36, alignItems: "center" },
  weekBadgeTxt: { color: "#EC4899", fontWeight: "800", fontSize: 11 },
  cardTitle: { flex: 1, fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  cardTip: { marginTop: 10, color: COLORS.textPrimary, lineHeight: 20, fontSize: 13 },
  disclaimer: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md, alignItems: "flex-start", marginTop: 8 },
  disclaimerTxt: { flex: 1, color: "#831843", fontSize: 11, lineHeight: 16 },
});
