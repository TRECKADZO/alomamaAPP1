import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const TRIMESTRES = [
  {
    n: 1, sa: "1 → 14 SA", color: ["#EC4899", "#F472B6"], emoji: "🌱",
    title: "1er Trimestre — Formation",
    points: [
      "Implantation de l'embryon, formation des organes vitaux",
      "Premier battement de coeur visible vers 6 SA",
      "Risque de fausse couche maximal — soyez prudente",
      "Nausées, fatigue, seins tendus très fréquents",
      "1ère consultation prénatale obligatoire",
      "Échographie de datation entre 11 et 13 SA",
      "Bilan sanguin : groupe, rhésus, sérologies",
    ],
    aevit: ["Tabac, alcool, drogues", "Médicaments sans avis médical", "Soulèvement de charges lourdes", "Effort physique intense"],
    afaire: ["Acide folique 0,4 mg/jour", "Supplémentation fer si anémie", "Hydratation 1,5 L/jour", "Repos suffisant"],
  },
  {
    n: 2, sa: "14 → 28 SA", color: ["#A855F7", "#C084FC"], emoji: "🌸",
    title: "2e Trimestre — Épanouissement",
    points: [
      "Le ventre grossit visiblement",
      "Premiers mouvements perçus (16-20 SA)",
      "Échographie morphologique majeure (20-22 SA)",
      "Bébé entend les sons extérieurs",
      "Bébé mesure 30 cm à la fin du trimestre",
      "Test de glycémie pour diabète gestationnel (24-28 SA)",
      "C'est la période la plus confortable de la grossesse",
    ],
    aevit: ["Toxoplasmose : viande crue, légumes mal lavés", "Listériose : fromages au lait cru, charcuterie", "Bains très chauds (>38°C)"],
    afaire: ["Alimentation variée riche en fer (foie, niébé, épinards)", "Inscription cours de préparation à l'accouchement", "Suivi mensuel"],
  },
  {
    n: 3, sa: "28 → 41 SA", color: ["#3B82F6", "#60A5FA"], emoji: "👶",
    title: "3e Trimestre — Préparation",
    points: [
      "Bébé prend rapidement du poids (~250g/semaine)",
      "Position céphalique se met en place",
      "Vaccin coqueluche recommandé à 28 SA",
      "Consultations mensuelles puis bimensuelles",
      "Échographie de croissance (32 SA)",
      "Préparer le sac de maternité dès 32 SA",
      "Consultation pré-anesthésique vers 34 SA",
      "Plan de naissance à finaliser",
    ],
    aevit: ["Long voyage en avion après 32 SA", "Stress intense", "Effort physique prolongé"],
    afaire: ["Compter les mouvements du bébé (>10/jour)", "Surveiller tension et œdèmes", "Préparer l'accueil de bébé", "Pratiquer respiration profonde"],
  },
];

export default function TrimestresScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#A855F7", "#EC4899"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📅 Les 3 Trimestres</Text>
          <Text style={styles.sub}>Comprendre les étapes clés</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {TRIMESTRES.map((t) => (
          <View key={t.n} style={styles.trimCard}>
            <LinearGradient colors={t.color as any} style={styles.trimHeader}>
              <Text style={styles.trimEmoji}>{t.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.trimTitle}>{t.title}</Text>
                <Text style={styles.trimSa}>{t.sa}</Text>
              </View>
            </LinearGradient>

            <View style={styles.trimBody}>
              <Text style={styles.subTitle}>📌 Ce qui se passe</Text>
              {t.points.map((p, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{p}</Text>
                </View>
              ))}

              <Text style={[styles.subTitle, { color: "#DC2626" }]}>⛔ À éviter</Text>
              <View style={styles.tagBox}>
                {t.aevit.map((a, i) => <View key={i} style={styles.tagBad}><Text style={styles.tagBadText}>{a}</Text></View>)}
              </View>

              <Text style={[styles.subTitle, { color: "#15803D" }]}>✅ À faire</Text>
              <View style={styles.tagBox}>
                {t.afaire.map((a, i) => <View key={i} style={styles.tagOk}><Text style={styles.tagOkText}>{a}</Text></View>)}
              </View>
            </View>
          </View>
        ))}
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
  trimCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 14, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  trimHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  trimEmoji: { fontSize: 36 },
  trimTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  trimSa: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
  trimBody: { padding: 14 },
  subTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13, marginTop: 12, marginBottom: 8 },
  bullet: { flexDirection: "row", gap: 8, marginVertical: 4 },
  bulletDot: { color: COLORS.primary, fontWeight: "800" },
  bulletText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
  tagBox: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagBad: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#FCA5A5" },
  tagBadText: { color: "#991B1B", fontSize: 11, fontWeight: "700" },
  tagOk: { backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#86EFAC" },
  tagOkText: { color: "#15803D", fontSize: 11, fontWeight: "700" },
});
