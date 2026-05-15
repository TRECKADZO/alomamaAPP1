import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { api } from "../../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../../constants/theme";

const TRIM_COLOR = ["#EC4899", "#8B5CF6", "#3B82F6"];

export default function SemaineDetail() {
  const { w } = useLocalSearchParams<{ w: string }>();
  const router = useRouter();
  const week = parseInt(String(w || "0"));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    api.get(`/grossesse-plus/week/${week}`).then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
    return () => { Speech.stop(); };
  }, [week]);

  const speak = () => {
    if (!data) return;
    if (reading) {
      Speech.stop();
      setReading(false);
      return;
    }
    const txt = `Semaine ${data.week}. Votre bébé a la taille d'un ${data.fruit}. Il mesure environ ${data.size_cm} centimètres et pèse environ ${data.weight_g} grammes. ${data.dev}. Chez la maman: ${data.changes}. Conseil de la semaine: ${data.tip}.`;
    setReading(true);
    Speech.speak(txt, { language: "fr-FR", rate: 0.95, onDone: () => setReading(false), onStopped: () => setReading(false), onError: () => setReading(false) });
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!data) return <SafeAreaView style={s.loader}><Text>Semaine introuvable</Text></SafeAreaView>;

  const trim = (data.trimester || 1) - 1;
  const color = TRIM_COLOR[trim];

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <View style={[s.hero, { backgroundColor: color }]}>
          <Text style={s.heroEmoji}>{data.emoji}</Text>
          <Text style={s.heroWeek}>Semaine {data.week}</Text>
          <Text style={s.heroFruit}>Taille d'un{data.fruit?.startsWith("a") || data.fruit?.startsWith("e") || data.fruit?.startsWith("é") || data.fruit?.startsWith("i") || data.fruit?.startsWith("o") || data.fruit?.startsWith("u") ? "" : "e"} {data.fruit}</Text>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statVal}>{data.size_cm} cm</Text>
              <Text style={s.statLbl}>Taille</Text>
            </View>
            <View style={s.divider} />
            <View style={s.stat}>
              <Text style={s.statVal}>{data.weight_g >= 1000 ? `${(data.weight_g/1000).toFixed(2)} kg` : `${data.weight_g} g`}</Text>
              <Text style={s.statLbl}>Poids</Text>
            </View>
          </View>
          <TouchableOpacity style={s.voiceBtn} onPress={speak}>
            <Ionicons name={reading ? "stop-circle" : "volume-high"} size={18} color="#fff" />
            <Text style={s.voiceTxt}>{reading ? "Arrêter" : "Écouter (français)"}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Ionicons name="baby" size={20} color={color} />
            <Text style={s.sectionTitle}>Développement du bébé</Text>
          </View>
          <Text style={s.bodyText}>{data.dev}</Text>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Ionicons name="woman" size={20} color={color} />
            <Text style={s.sectionTitle}>Chez la maman</Text>
          </View>
          <Text style={s.bodyText}>{data.changes}</Text>
        </View>

        <View style={[s.section, s.tip, { borderColor: color }]}>
          <View style={s.sectionHead}>
            <Ionicons name="bulb" size={20} color={color} />
            <Text style={s.sectionTitle}>Conseil de la semaine</Text>
          </View>
          <Text style={s.bodyText}>{data.tip}</Text>
        </View>

        <View style={s.navRow}>
          <TouchableOpacity disabled={week <= 4} style={[s.navBtn, week <= 4 && s.disabled]} onPress={() => router.replace(`/grossesse-plus/semaine/${week - 1}` as any)}>
            <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
            <Text style={s.navTxt}>SA {week - 1}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={week >= 41} style={[s.navBtn, week >= 41 && s.disabled]} onPress={() => router.replace(`/grossesse-plus/semaine/${week + 1}` as any)}>
            <Text style={s.navTxt}>SA {week + 1}</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={s.disclaimer}>⚠️ Ces informations sont éducatives et ne remplacent pas un avis médical.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  hero: { borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", marginBottom: 16 },
  heroEmoji: { fontSize: 70, marginBottom: 8 },
  heroWeek: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  heroFruit: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 4, marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 24, alignItems: "center" },
  stat: { alignItems: "center" },
  statVal: { color: "#fff", fontSize: 20, fontWeight: "800" },
  statLbl: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  divider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.4)" },
  section: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  bodyText: { color: COLORS.textPrimary, lineHeight: 21, fontSize: 14 },
  tip: { borderLeftWidth: 4 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  navTxt: { fontWeight: "800", color: COLORS.textPrimary },
  disabled: { opacity: 0.4 },
  disclaimer: { textAlign: "center", color: COLORS.textMuted, fontSize: 11, marginTop: 16, fontStyle: "italic" },
  voiceBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: RADIUS.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  voiceTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
