import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Conjoint() {
  const [checklist, setChecklist] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([
          api.get("/postpartum/conjoint/checklist"),
          api.get("/postpartum/conjoint/current-message"),
        ]);
        setChecklist(a.data.items || []);
        setCurrent(b.data);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const share = async () => {
    if (!current) return;
    try {
      await Share.share({
        title: "Pour mon conjoint",
        message: `💗 Message d'Alo Maman pour toi :\n\n${current.message_to_partner}\n\nMerci de prendre soin de moi.`,
      });
    } catch (e: any) { Alert.alert("Erreur", e?.message); }
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {current && (
          <View style={s.msgCard}>
            <Text style={s.msgLabel}>
              {current.discovery_mode ? "DÉCOUVERTE · MESSAGE D'ACCUEIL" : "MESSAGE DE LA SEMAINE"}
            </Text>
            <Text style={s.msgWeek}>
              {current.discovery_mode
                ? "Premier message du parcours"
                : `Semaine ${current.message_week} après accouchement`}
            </Text>
            <Text style={s.msgTxt}>{current.message_to_partner}</Text>
            <TouchableOpacity style={s.shareBtn} onPress={share}>
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={s.shareTxt}>Envoyer à mon conjoint</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.title}>Checklist : comment soutenir ma compagne</Text>
        <Text style={s.sub}>9 gestes simples qui changent tout.</Text>

        {checklist.map(item => (
          <TouchableOpacity
            key={item.id}
            style={s.cardRow}
            onPress={() => setDone(d => ({ ...d, [item.id]: !d[item.id] }))}
          >
            <View style={[s.box, done[item.id] && s.boxOn]}>
              {done[item.id] && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={[s.itemTxt, done[item.id] && s.itemTxtDone]}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        <View style={s.tipBox}>
          <Ionicons name="heart" size={20} color="#EC4899" />
          <Text style={s.tipTxt}>
            “80% des dépressions post-partum auraient pu être évitées ou rapidement gérées avec un meilleur soutien du partenaire.” — Étude OMS 2024.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FDF2F8" },
  msgCard: { padding: SPACING.lg, backgroundColor: "#EC4899", borderRadius: RADIUS.lg, marginBottom: 20 },
  msgLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  msgWeek: { color: "#fff", fontWeight: "800", marginTop: 4, fontSize: 14 },
  msgTxt: { color: "#fff", lineHeight: 21, fontSize: 14, marginTop: 10 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, marginTop: 14, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: RADIUS.pill },
  shareTxt: { color: "#fff", fontWeight: "800" },
  title: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 17, marginBottom: 4 },
  sub: { color: COLORS.textSecondary, marginBottom: 16, lineHeight: 18 },
  cardRow: { flexDirection: "row", gap: 12, padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.md, marginBottom: 8, alignItems: "flex-start" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  boxOn: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  itemTxt: { flex: 1, color: COLORS.textPrimary, lineHeight: 19 },
  itemTxtDone: { color: COLORS.textMuted, textDecorationLine: "line-through" },
  tipBox: { flexDirection: "row", gap: 10, padding: 14, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md, marginTop: 20, alignItems: "flex-start" },
  tipTxt: { flex: 1, color: "#831843", fontSize: 12, lineHeight: 17, fontStyle: "italic" },
});
