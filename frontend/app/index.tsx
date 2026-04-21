import { useEffect } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { COLORS, IMAGES, RADIUS, SPACING } from "../constants/theme";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(tabs)");
    }
  }, [loading, user]);

  if (loading) {
    return (
      <View style={styles.loading} testID="splash-loading">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (user) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.heroWrap}>
        <Image source={{ uri: IMAGES.heroMaman }} style={styles.hero} resizeMode="cover" />
        <View style={styles.overlay} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>SANTÉ MATERNELLE</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title} testID="app-title">À lo Maman</Text>
        <Text style={styles.subtitle}>
          Votre accompagnatrice de confiance pour la grossesse, le suivi des enfants et le bien-être familial.
        </Text>

        <View style={styles.features}>
          <Feature icon="heart" text="Suivi grossesse semaine par semaine" />
          <Feature icon="medkit" text="Carnet de santé de vos enfants" />
          <Feature icon="chatbubbles" text="Assistant IA & communauté de mamans" />
        </View>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => router.push("/(auth)/register")}
          testID="get-started-btn"
        >
          <Text style={styles.btnPrimaryText}>Commencer</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => router.push("/(auth)/login")}
          testID="goto-login-btn"
        >
          <Text style={styles.btnSecondaryText}>J'ai déjà un compte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnPro}
          onPress={() => router.push("/portail-pro")}
          testID="goto-portail-pro"
        >
          <Ionicons name="medkit-outline" size={16} color={COLORS.primary} />
          <Text style={styles.btnProText}>Portail Professionnel / Centre de santé</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Feature({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  heroWrap: { height: "45%", width: "100%", position: "relative" },
  hero: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    inset: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(45,51,47,0.25)",
  },
  badge: {
    position: "absolute",
    top: 20,
    left: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 1.5,
  },
  content: { flex: 1, padding: SPACING.xl, justifyContent: "space-between" },
  title: { fontSize: 42, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -1 },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 10,
    lineHeight: 22,
  },
  features: { marginVertical: SPACING.xl, gap: SPACING.md },
  feature: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { color: COLORS.textPrimary, fontSize: 14, flex: 1, fontWeight: "500" },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    minHeight: 52,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  btnSecondary: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    minHeight: 48,
  },
  btnSecondaryText: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 14 },
  btnPro: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  btnProText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
});
