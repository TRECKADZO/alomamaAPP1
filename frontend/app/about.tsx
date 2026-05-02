import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function AboutScreen() {
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version || "1.0.0";
  const buildNumber = Platform.OS === "android"
    ? Constants.expoConfig?.android?.versionCode || "?"
    : Constants.expoConfig?.ios?.buildNumber || "?";

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>À propos</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Logo + version */}
        <View style={styles.logoBox}>
          <Image source={require("../assets/images/icon.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.appName}>À lo Maman</Text>
          <Text style={styles.tagline}>Votre santé, votre tranquillité</Text>
          <View style={styles.versionPill}>
            <Text style={styles.versionText}>Version {appVersion} · Build {buildNumber}</Text>
          </View>
        </View>

        {/* Mission */}
        <LinearGradient colors={["#F4A754", "#D97843"]} style={styles.missionCard}>
          <Ionicons name="heart" size={28} color="#fff" />
          <Text style={styles.missionTitle}>Notre mission</Text>
          <Text style={styles.missionText}>
            Faciliter l'accès à des soins maternels et pédiatriques de qualité pour toutes les mamans en Côte d'Ivoire et au-delà,
            grâce à la téléconsultation, au suivi de grossesse intelligent, et à la couverture CMU.
          </Text>
        </LinearGradient>

        {/* Fonctionnalités clés */}
        <Text style={styles.sectionTitle}>✨ Fonctionnalités clés</Text>
        <Feature icon="videocam" color="#3B82F6" title="Téléconsultation HD" desc="Vidéo HD optimisée 3G+ avec Agora.io" />
        <Feature icon="heart" color="#EC4899" title="Suivi de grossesse" desc="6 mois de prédictions, conseils personnalisés" />
        <Feature icon="people" color="#10B981" title="Carnet enfant complet" desc="Vaccins, mesures, courbes OMS" />
        <Feature icon="shield-checkmark" color="#8B5CF6" title="Sécurité AES-256" desc="Données médicales chiffrées au repos" />
        <Feature icon="card" color="#F59E0B" title="CMU intégrée" desc="Couverture santé universelle" />
        <Feature icon="document-text" color="#06B6D4" title="Déclaration de naissance" desc="PDF officiel généré automatiquement" />
        <Feature icon="cloud-offline" color="#64748B" title="Mode hors-ligne" desc="L'app fonctionne même sans connexion" />

        {/* Statistiques */}
        <Text style={styles.sectionTitle}>📊 Quelques chiffres</Text>
        <View style={styles.statsRow}>
          <StatBox label="Mamans accompagnées" value="10K+" color="#EC4899" />
          <StatBox label="Pros partenaires" value="1 500+" color="#3B82F6" />
        </View>
        <View style={styles.statsRow}>
          <StatBox label="Centres de santé" value="200+" color="#10B981" />
          <StatBox label="Villes couvertes" value="50+" color="#F59E0B" />
        </View>

        {/* Equipe / Editeur */}
        <Text style={styles.sectionTitle}>🏢 Éditeur</Text>
        <View style={styles.editorCard}>
          <Text style={styles.editorName}>e-Medicare</Text>
          <Text style={styles.editorAddr}>Abidjan, Côte d'Ivoire</Text>
          <TouchableOpacity style={styles.editorRow} onPress={() => openLink("mailto:infos@e-medicare.co")}>
            <Ionicons name="mail" size={16} color={COLORS.primary} />
            <Text style={styles.editorLink}>infos@e-medicare.co</Text>
          </TouchableOpacity>
        </View>

        {/* Liens légaux */}
        <Text style={styles.sectionTitle}>📚 Mentions légales</Text>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/cgu")}>
          <Ionicons name="document-text-outline" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Conditions générales d'utilisation</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/privacy")}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Politique de confidentialité</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/aide-support" as any)}>
          <Ionicons name="help-circle-outline" size={20} color={COLORS.primary} />
          <Text style={styles.linkText}>Aide & Support</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* Crédits */}
        <View style={styles.credits}>
          <Text style={styles.creditsLine}>Conçue avec ❤️ pour les mamans d'Afrique</Text>
          <Text style={styles.creditsLine}>© 2026 À lo Maman — Tous droits réservés</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ icon, color, title, desc }: any) {
  return (
    <View style={styles.featureRow}>
      <View style={[styles.featureIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function StatBox({ label, value, color }: any) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  logoBox: { alignItems: "center", marginVertical: 20 },
  logo: { width: 100, height: 100, borderRadius: 24 },
  appName: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  tagline: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, fontStyle: "italic" },
  versionPill: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.surface, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, marginTop: 10 },
  versionText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700" },

  missionCard: { padding: 16, borderRadius: RADIUS.lg, marginBottom: 16 },
  missionTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 8 },
  missionText: { color: "#fff", fontSize: 13, lineHeight: 19, marginTop: 8, opacity: 0.95 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 20, marginBottom: 10 },

  featureRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  featureIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  featureTitle: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  featureDesc: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: { flex: 1, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 4, borderWidth: 1, borderColor: COLORS.border },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, fontWeight: "600" },

  editorCard: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  editorName: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  editorAddr: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  editorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  editorLink: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },

  socialRow: { flexDirection: "row", gap: 8 },
  socialBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, borderRadius: RADIUS.md },
  socialText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  linkText: { flex: 1, color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },

  credits: { alignItems: "center", marginTop: 30, paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 4 },
  creditsLine: { color: COLORS.textMuted, fontSize: 11, textAlign: "center" },
});
