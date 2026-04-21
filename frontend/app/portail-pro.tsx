import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Platform, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../lib/auth";
import { formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW, IMAGES } from "../constants/theme";

export default function PortailPro() {
  const router = useRouter();
  const { login } = useAuth();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if ((mode === "email" && !email) || (mode === "phone" && !phone) || !password) {
      return Alert.alert("Champs requis", "Merci de remplir tous les champs.");
    }
    setLoading(true);
    try {
      const creds: any = { password };
      if (mode === "email") creds.email = email.trim().toLowerCase();
      else creds.phone = phone.trim();
      const user = await login(creds);

      // Bloquer les mamans/famille — ce portail est réservé aux pros
      if (user.role === "maman" || user.role === "famille") {
        Alert.alert(
          "Portail réservé aux professionnels",
          "Votre compte est de type « " + user.role + " ». Merci d'utiliser l'application mobile À lo Maman pour accéder à votre espace.",
        );
        setLoading(false);
        return;
      }

      // Redirection selon le rôle
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Échec de la connexion", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <View style={styles.topBar}>
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoEmoji}>🌸</Text>
              </View>
              <View>
                <Text style={styles.brand}>À lo Maman</Text>
                <Text style={styles.tagline}>Portail Professionnel</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push("/(auth)/login")} style={styles.mobileBtn}>
              <Ionicons name="phone-portrait-outline" size={16} color={COLORS.primary} />
              <Text style={styles.mobileBtnText}>Je suis maman</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/plans")} style={[styles.mobileBtn, { marginLeft: 8 }]}>
              <Ionicons name="pricetags-outline" size={16} color={COLORS.primary} />
              <Text style={styles.mobileBtnText}>Nos offres</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.main}>
            {/* Left — Hero */}
            <View style={styles.hero}>
              <LinearGradient
                colors={["#FDEFE6", "#F9E7D5"]}
                style={styles.heroCard}
              >
                <Image source={{ uri: IMAGES.heroMaman }} style={styles.heroImg} resizeMode="cover" />
                <View style={styles.heroOverlay}>
                  <Text style={styles.heroTitle}>La plateforme santé maternelle de Côte d'Ivoire</Text>
                  <Text style={styles.heroSub}>
                    Suivez vos patientes, gérez vos rendez-vous et centralisez les dossiers médicaux — du suivi prénatal aux premiers pas de bébé.
                  </Text>
                </View>
              </LinearGradient>

              <View style={styles.featuresGrid}>
                <Feature icon="calendar" title="Agenda centralisé" desc="RDV, disponibilités & téléconsultations en un seul endroit." />
                <Feature icon="people" title="Dossier patiente" desc="Grossesse, enfants, vaccins, notes — tout est accessible rapidement." />
                <Feature icon="videocam" title="Téléconsultation" desc="Consultez à distance les mamans en zone rurale." />
                <Feature icon="analytics" title="Statistiques" desc="Tableaux de bord sur l'activité de votre centre." />
                <Feature icon="cloud-offline" title="Mode hors ligne" desc="Travaillez même sans connexion stable — synchro automatique." />
                <Feature icon="shield-checkmark" title="Confidentialité" desc="Données chiffrées, conformes aux standards FHIR / HL7." />
              </View>
            </View>

            {/* Right — Login card */}
            <View style={styles.loginPane}>
              <View style={styles.loginCard}>
                <Text style={styles.loginTitle}>Connexion</Text>
                <Text style={styles.loginSub}>Réservé aux professionnels de santé, centres de santé et administrateurs.</Text>

                {/* Toggle email / phone */}
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, mode === "email" && styles.toggleActive]}
                    onPress={() => setMode("email")}
                  >
                    <Ionicons name="mail-outline" size={16} color={mode === "email" ? "#fff" : COLORS.primary} />
                    <Text style={[styles.toggleText, mode === "email" && { color: "#fff" }]}>Email</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, mode === "phone" && styles.toggleActive]}
                    onPress={() => setMode("phone")}
                  >
                    <Ionicons name="call-outline" size={16} color={mode === "phone" ? "#fff" : COLORS.primary} />
                    <Text style={[styles.toggleText, mode === "phone" && { color: "#fff" }]}>Téléphone</Text>
                  </TouchableOpacity>
                </View>

                {mode === "email" ? (
                  <>
                    <Text style={styles.label}>Email professionnel</Text>
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="vous@exemple.com"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      testID="portail-email"
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Numéro de téléphone</Text>
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+225 XX XX XX XX XX"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="phone-pad"
                      testID="portail-phone"
                    />
                  </>
                )}

                <Text style={styles.label}>Mot de passe</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry
                  testID="portail-password"
                />

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleLogin}
                  disabled={loading}
                  testID="portail-submit"
                >
                  {loading ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Text style={styles.submitText}>Se connecter</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OU</Text><View style={styles.dividerLine} /></View>

                <TouchableOpacity style={styles.registerBtn} onPress={() => router.push("/(auth)/register?role=professionnel")}>
                  <Ionicons name="medkit-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.registerText}>Créer un compte Professionnel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.registerBtn} onPress={() => router.push("/(auth)/register?role=centre_sante")}>
                  <Ionicons name="business-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.registerText}>Créer un compte Centre de santé</Text>
                </TouchableOpacity>

                <View style={styles.helpBox}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.helpText}>
                    Vous êtes une maman ou un parent ? Téléchargez l'application mobile pour accéder à votre espace personnel.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>© 2026 À lo Maman · Plateforme de santé maternelle et pédiatrique</Text>
            <Text style={styles.footerText}>Côte d'Ivoire · support@alomaman.com</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Feature({ icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}><Ionicons name={icon} size={20} color={COLORS.primary} /></View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  );
}

const isWeb = Platform.OS === "web";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { flexGrow: 1 },

  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  logoEmoji: { fontSize: 22 },
  brand: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  tagline: { fontSize: 11, color: COLORS.primary, fontWeight: "700", textTransform: "uppercase" },
  mobileBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  mobileBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },

  main: {
    flexDirection: isWeb ? "row" : "column",
    padding: SPACING.xl,
    gap: 28,
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },

  hero: { flex: isWeb ? 1.2 : undefined, gap: 20 },
  heroCard: { borderRadius: 20, overflow: "hidden", minHeight: 240, position: "relative" },
  heroImg: { width: "100%", height: 280 },
  heroOverlay: { padding: 22, gap: 6 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, lineHeight: 28 },
  heroSub: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginTop: 4 },

  featuresGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6,
  },
  feature: {
    flexBasis: isWeb ? "47%" : "100%",
    flexGrow: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  featureIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  featureTitle: { fontWeight: "800", fontSize: 14, color: COLORS.textPrimary },
  featureDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, lineHeight: 17 },

  loginPane: { flex: isWeb ? 1 : undefined, alignItems: isWeb ? "flex-end" : "stretch" },
  loginCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.md,
  },
  loginTitle: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  loginSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 18, lineHeight: 18 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: "transparent" },
  toggleActive: { backgroundColor: COLORS.primary },
  toggleText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },

  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.bgPrimary, color: COLORS.textPrimary, fontSize: 14,
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 999, marginTop: 20,
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700" },

  registerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 8, backgroundColor: COLORS.bgPrimary },
  registerText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },

  helpBox: { flexDirection: "row", gap: 6, padding: 12, backgroundColor: COLORS.secondaryLight, borderRadius: 10, marginTop: 18 },
  helpText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },

  footer: { padding: 24, alignItems: "center", borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 20 },
  footerText: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
