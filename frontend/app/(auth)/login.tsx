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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Champs requis", "Veuillez renseigner email et mot de passe");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (type: string) => {
    if (type === "maman") {
      setEmail("maman@test.com");
      setPassword("Maman123!");
    } else if (type === "pro") {
      setEmail("pro@test.com");
      setPassword("Pro123!");
    } else {
      setEmail("admin@alomaman.com");
      setPassword("Admin123!");
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

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="vous@exemple.com"
                placeholderTextColor={COLORS.textMuted}
                testID="login-email-input"
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

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Comptes de démo</Text>
            <View style={styles.demoRow}>
              <TouchableOpacity style={styles.demoBtn} onPress={() => fillDemo("maman")} testID="demo-maman-btn">
                <Text style={styles.demoBtnText}>👩 Maman</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.demoBtn} onPress={() => fillDemo("pro")} testID="demo-pro-btn">
                <Text style={styles.demoBtnText}>🩺 Pro</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.demoBtn} onPress={() => fillDemo("admin")} testID="demo-admin-btn">
                <Text style={styles.demoBtnText}>⚙️ Admin</Text>
              </TouchableOpacity>
            </View>
          </View>

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
