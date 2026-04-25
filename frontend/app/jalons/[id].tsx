import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type Domaine = "moteur" | "cognitif" | "langage" | "affectif" | "social";

const DOMAINE_LABEL: Record<Domaine, { icon: string; label: string; color: string }> = {
  moteur:    { icon: "walk",          label: "Moteur",          color: "#3B82F6" },
  cognitif:  { icon: "bulb",          label: "Cognitif",        color: "#F59E0B" },
  langage:   { icon: "chatbubbles",   label: "Langage",         color: "#10B981" },
  affectif:  { icon: "heart",         label: "Affectif",        color: "#EC4899" },
  social:    { icon: "people",        label: "Social",          color: "#A855F7" },
};

export default function JalonsEnfantScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enfantNom, setEnfantNom] = useState<string>("");
  const [acquired, setAcquired] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get(`/enfants/${id}/jalons`).then((r) => r.data),
      api.get("/enfants").then((r) => r.data?.find((e: any) => e.id === id)).catch(() => null),
    ]).then(([j, e]) => {
      setData(j);
      setEnfantNom(e?.nom || "Enfant");
      setLoading(false);
    }).catch((err) => {
      Alert.alert("Erreur", formatError(err));
      setLoading(false);
    });
  }, [id]);

  const toggleItem = (key: string) => {
    setAcquired((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.loading}><Text style={styles.empty}>Aucune donnée</Text></SafeAreaView>;

  const j = data.jalon;
  const ageMois = data.age_mois;
  const tropJeune = data.trop_jeune;

  // Calculer score
  const allItems: { key: string; text: string; domaine: Domaine }[] = [];
  (Object.keys(DOMAINE_LABEL) as Domaine[]).forEach((d) => {
    (j[d] || []).forEach((t: string, i: number) => {
      allItems.push({ key: `${d}-${i}`, text: t, domaine: d });
    });
  });
  const score = Object.values(acquired).filter(Boolean).length;
  const total = allItems.length;
  const scorePct = total ? Math.round((score / total) * 100) : 0;
  const scoreColor = scorePct >= 80 ? "#16A34A" : scorePct >= 50 ? "#F59E0B" : "#DC2626";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#0EA5E9"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{enfantNom} — Étapes de développement</Text>
          <Text style={styles.sub}>{ageMois} mois · {j.title}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {tropJeune && (
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={18} color="#1E40AF" />
            <Text style={styles.warningText}>Votre enfant est encore très jeune. Voici les premières étapes attendues à 2 mois — ne vous inquiétez pas si tout n'est pas encore acquis.</Text>
          </View>
        )}

        {/* Score */}
        {total > 0 && (
          <View style={styles.scoreCard}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
              <Text style={styles.scoreSlash}>/{total}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scoreTitle}>Mon bilan</Text>
              <Text style={styles.scoreSub}>
                {scorePct >= 80 ? "✨ Excellent ! Le développement suit bien les jalons attendus."
                  : scorePct >= 50 ? "👍 Bonne progression. Continuez à stimuler."
                    : score === 0 ? "Cochez ce que votre enfant fait pour évaluer."
                      : "💡 Quelques étapes à travailler. N'hésitez pas à consulter un pédiatre si besoin."}
              </Text>
            </View>
          </View>
        )}

        {/* Items par domaine */}
        {(Object.keys(DOMAINE_LABEL) as Domaine[]).map((d) => {
          const meta = DOMAINE_LABEL[d];
          const items: string[] = j[d] || [];
          if (items.length === 0) return null;
          return (
            <View key={d} style={styles.domaineBox}>
              <View style={styles.domaineHead}>
                <View style={[styles.domaineIcon, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <Text style={styles.domaineTitle}>{meta.label}</Text>
              </View>
              {items.map((item, i) => {
                const k = `${d}-${i}`;
                const ok = acquired[k];
                return (
                  <TouchableOpacity key={k} onPress={() => toggleItem(k)} style={styles.itemRow} testID={`jalon-${k}`}>
                    <View style={[styles.checkbox, ok && { backgroundColor: meta.color, borderColor: meta.color }]}>
                      {ok && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={[styles.itemText, ok && { color: COLORS.textMuted, textDecorationLine: "line-through" }]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* Alertes */}
        {(j.alerte || []).length > 0 && (
          <View style={styles.alerteBox}>
            <View style={styles.alerteHead}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.alerteTitle}>⚠️ Quand consulter</Text>
            </View>
            <Text style={styles.alerteIntro}>Si l'un de ces signes vous inquiète, parlez-en à un pédiatre :</Text>
            {j.alerte.map((a: string, i: number) => (
              <View key={i} style={styles.alerteRow}>
                <Text style={styles.alerteDot}>•</Text>
                <Text style={styles.alerteItem}>{a}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.alerteCta} onPress={() => router.push("/search")}>
              <Ionicons name="medkit" size={16} color="#fff" />
              <Text style={styles.alerteCtaText}>Trouver un pédiatre</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Ces étapes sont indicatives (référence OMS et Société de Pédiatrie). Chaque enfant évolue à son rythme. En cas de doute, consultez votre pédiatre.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  empty: { color: COLORS.textSecondary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  warningBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#DBEAFE", borderRadius: RADIUS.md, marginTop: 16, borderWidth: 1, borderColor: "#93C5FD" },
  warningText: { flex: 1, color: "#1E3A8A", fontSize: 12, lineHeight: 16 },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginTop: 16, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  scoreCircle: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  scoreNum: { fontSize: 24, fontWeight: "800" },
  scoreSlash: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "700" },
  scoreTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  scoreSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16 },
  domaineBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, marginTop: 14, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  domaineHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  domaineIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  domaineTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  itemText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
  alerteBox: { backgroundColor: "#FEF2F2", borderRadius: RADIUS.lg, padding: 14, marginTop: 16, borderWidth: 1, borderColor: "#FCA5A5" },
  alerteHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  alerteTitle: { fontWeight: "800", color: "#991B1B", fontSize: 14 },
  alerteIntro: { color: "#7F1D1D", fontSize: 12, marginBottom: 8, lineHeight: 16 },
  alerteRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  alerteDot: { color: "#DC2626", fontWeight: "800" },
  alerteItem: { flex: 1, color: "#7F1D1D", fontSize: 12, lineHeight: 16 },
  alerteCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#DC2626", paddingVertical: 10, borderRadius: 999, marginTop: 12 },
  alerteCtaText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  disclaimer: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic", marginTop: 20, textAlign: "center", lineHeight: 16 },
});
