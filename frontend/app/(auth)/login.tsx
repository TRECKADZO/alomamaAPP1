import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert("Champs requis", `Veuillez renseigner ${mode === "email" ? "email" : "téléphone"} et mot de passe`);
      return;
    }
    setLoading(true);
    try {
      await login(
        { [mode]: mode === "email" ? identifier.trim().toLowerCase() : identifier.trim(), password } as any
      );
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.back}
            testID="login-back-btn"
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title}>Bon retour 👋</Text>
          <Text style={styles.subtitle}>Connectez-vous pour accéder à votre espace</Text>

          {/* Toggle email / téléphone */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "email" && styles.modeBtnActive]}
              onPress={() => { setMode("email"); setIdentifier(""); }}
              testID="mode-email-btn"
            >
              <Ionicons name="mail" size={14} color={mode === "email" ? "#fff" : COLORS.textPrimary} />
              <Text style={[styles.modeBtnText, mode === "email" && { color: "#fff" }]}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "phone" && styles.modeBtnActive]}
              onPress={() => { setMode("phone"); setIdentifier(""); }}
              testID="mode-phone-btn"
            >
              <Ionicons name="call" size={14} color={mode === "phone" ? "#fff" : COLORS.textPrimary} />
              <Text style={[styles.modeBtnText, mode === "phone" && { color: "#fff" }]}>Téléphone</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{mode === "email" ? "Email" : "Numéro de téléphone"}</Text>
            <View style={styles.inputWrap}>
              <Ionicons name={mode === "email" ? "mail-outline" : "call-outline"} size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                keyboardType={mode === "email" ? "email-address" : "phone-pad"}
                placeholder={mode === "email" ? "vous@exemple.com" : "+225 XX XX XX XX"}
                placeholderTextColor={COLORS.textMuted}
                testID="login-identifier-input"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textMuted}
                testID="login-password-input"
              />
              <TouchableOpacity onPress={() => setShowPw(!showPw)}>
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleLogin}
            disabled={loading}
            testID="login-submit-btn"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>Se connecter</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Pas encore de compte ? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity testID="goto-register-link">
                <Text style={styles.footerLink}>S'inscrire</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.xl, flexGrow: 1 },
  back: { width: 40, height: 40, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "800", color: COLORS.textPrimary, marginTop: 10 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginTop: 6, marginBottom: SPACING.xl },
  field: { marginBottom: SPACING.lg },
  modeToggle: { flexDirection: "row", gap: 6, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, padding: 4, marginBottom: SPACING.lg },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: RADIUS.pill },
  modeBtnActive: { backgroundColor: COLORS.primary },
  modeBtnText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.md,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  demoBox: {
    backgroundColor: COLORS.secondaryLight,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.xl,
  },
  demoTitle: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 10 },
  demoRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  demoBtn: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  demoBtnText: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "600" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: SPACING.xl },
  footerText: { color: COLORS.textSecondary },
  footerLink: { color: COLORS.primary, fontWeight: "700" },
});
