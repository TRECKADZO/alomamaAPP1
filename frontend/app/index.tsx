import { useEffect } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ScrollView, Dimensions, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { COLORS, IMAGES, RADIUS, SPACING } from "../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  // Hero adaptatif selon hauteur écran : 38% max 360, 240 min
  const screenH = Dimensions.get("window").height;
  const heroH = Math.max(220, Math.min(360, screenH * 0.38));

  return (
    <View style={styles.container} testID="landing-screen">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // respecter la barre de nav Android et le home indicator iOS
          { paddingBottom: Math.max(24, insets.bottom + 16) },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.heroWrap, { height: heroH }]}>
          <Image source={{ uri: IMAGES.heroMaman }} style={styles.hero} resizeMode="cover" />
          <View style={styles.overlay} />
          {/* Badge : ajusté sous la status bar + banner offline (~40px) */}
          <View style={[styles.badge, { top: 16 }]}>
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
            <Feature icon="shield-checkmark" text="CMU & ressources OMS / UNICEF" />
          </View>

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => router.push("/(auth)/register")}
            testID="get-started-btn"
            activeOpacity={0.85}
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
      </ScrollView>
    </View>
  );
}

function Feature({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.featureText} numberOfLines={2}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  scroll: { flexGrow: 1 },
  heroWrap: { width: "100%", position: "relative", overflow: "hidden" },
  hero: { width: "100%", height: "100%" },
  overlay: {
    ...Platform.select({ web: { position: "absolute" as any, inset: 0 as any } as any, default: { position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0 } }),
    backgroundColor: "rgba(45,51,47,0.25)",
  },
  badge: {
    position: "absolute",
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
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl },
  title: { fontSize: 36, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -1 },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  features: { marginVertical: SPACING.lg, gap: 12 },
  feature: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureText: { color: COLORS.textPrimary, fontSize: 13, flex: 1, fontWeight: "500" },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    minHeight: 52,
    marginTop: SPACING.md,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  btnSecondary: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    minHeight: 44,
  },
  btnSecondaryText: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 14 },
  btnPro: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  btnProText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
});
