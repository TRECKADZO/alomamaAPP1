import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const NUTRITION = [
  {
    titre: "T1 — 1er trimestre",
    intro: "Acide folique, hydratation, gestion des nausées.",
    color: ["#EC4899", "#F472B6"],
    privilegier: [
      "Légumes verts (épinards, brèdes, gombo) — riches en folates",
      "Fruits frais (mangue, papaye, orange) — vitamine C",
      "Œufs cuits, foie de volaille — fer + B12",
      "Niébé, haricots — protéines + fer",
      "Riz, mil, foufou — énergie",
      "Eau (1,5-2 L/j)",
    ],
    eviter: [
      "Café, thé fort (limiter à 1 tasse/j)",
      "Tabac, alcool — aucune dose acceptable",
      "Viande crue ou peu cuite (toxoplasmose)",
      "Œuf cru ou mollet (salmonelle)",
      "Médicaments non prescrits",
    ],
    astuce: "Mangez par petites quantités plus souvent. Crackers/biscuits secs au réveil pour réduire les nausées.",
  },
  {
    titre: "T2 — 2e trimestre",
    intro: "Apports en fer, calcium, oméga-3.",
    color: ["#A855F7", "#C084FC"],
    privilegier: [
      "Poisson cuit 2x/semaine (sardines, thiof, capitaine)",
      "Lait, yaourt, fromage doux — calcium",
      "Foie 1x/sem — fer + vit A",
      "Légumineuses (niébé, haricots, lentilles)",
      "Avocat, huile de palme rouge — bons gras",
      "Patate douce, igname, mil",
    ],
    eviter: [
      "Charcuterie (listériose)",
      "Fromages au lait cru",
      "Poissons riches en mercure (espadon, requin)",
      "Aliments très salés (œdèmes)",
      "Sucreries en excès",
    ],
    astuce: "Associez un fruit riche en vitamine C (mangue, orange) à chaque repas riche en fer pour mieux l'absorber.",
  },
  {
    titre: "T3 — 3e trimestre",
    intro: "Protéines, hydratation, énergie.",
    color: ["#3B82F6", "#60A5FA"],
    privilegier: [
      "Protéines variées (poisson, œuf, foie, niébé)",
      "Céréales complètes (mil, sorgho, riz semi-complet)",
      "Fruits/légumes 5x/jour",
      "Eau abondante (2 L/j)",
      "Yaourt nature pour la digestion",
    ],
    eviter: [
      "Repas très lourds le soir (reflux)",
      "Plats trop épicés (piment)",
      "Boissons gazeuses",
      "Excès de sel",
    ],
    astuce: "Mangez 5-6 petits repas/jour au lieu de 3 gros pour éviter brûlures d'estomac et lourdeurs.",
  },
];

export default function NutritionScreen() {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const t = NUTRITION[active];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🍎 Nutrition</Text>
          <Text style={styles.sub}>Conseils par trimestre — Afrique de l'Ouest</Text>
        </View>
      </LinearGradient>

      <View style={styles.tabs}>
        {NUTRITION.map((n, i) => (
          <TouchableOpacity key={i} onPress={() => setActive(i)} style={[styles.tab, i === active && styles.tabActive]} testID={`tab-${i}`}>
            <Text style={[styles.tabText, i === active && { color: "#fff" }]}>{n.titre.split(" — ")[0]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 60 }}>
        <LinearGradient colors={t.color as any} style={styles.intro}>
          <Text style={styles.introTitle}>{t.titre}</Text>
          <Text style={styles.introText}>{t.intro}</Text>
        </LinearGradient>

        <Text style={styles.sectionTitle}>✅ À privilégier</Text>
        {t.privilegier.map((it, i) => (
          <View key={i} style={[styles.row, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
            <Ionicons name="checkmark-circle" size={18} color="#15803D" />
            <Text style={[styles.rowText, { color: "#14532D" }]}>{it}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: "#DC2626" }]}>⛔ À éviter</Text>
        {t.eviter.map((it, i) => (
          <View key={i} style={[styles.row, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
            <Ionicons name="close-circle" size={18} color="#991B1B" />
            <Text style={[styles.rowText, { color: "#7F1D1D" }]}>{it}</Text>
          </View>
        ))}

        <View style={styles.tipsBox}>
          <Ionicons name="bulb" size={18} color="#92400E" />
          <Text style={styles.tipsText}>💡 {t.astuce}</Text>
        </View>

        <View style={styles.alerteBox}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text style={styles.alerteText}>⚠️ Tabac, alcool et drogues sont strictement interdits durant TOUTE la grossesse. Aucune dose n'est sûre.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: "row", padding: SPACING.xl, gap: 6 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  tabActive: { backgroundColor: "#10B981", borderColor: "#10B981" },
  tabText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
  intro: { padding: 16, borderRadius: RADIUS.lg, marginBottom: 14, ...SHADOW.sm },
  introTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  introText: { color: "rgba(255,255,255,0.95)", fontSize: 13, marginTop: 4 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1 },
  rowText: { flex: 1, fontSize: 13, lineHeight: 18 },
  tipsBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, marginTop: 14, borderWidth: 1, borderColor: "#FCD34D" },
  tipsText: { flex: 1, color: "#78350F", fontSize: 13, lineHeight: 18 },
  alerteBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: "#FEE2E2", borderRadius: RADIUS.md, marginTop: 10, borderWidth: 1, borderColor: "#FCA5A5" },
  alerteText: { flex: 1, color: "#7F1D1D", fontSize: 12, lineHeight: 17, fontWeight: "600" },
});
