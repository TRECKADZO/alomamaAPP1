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

type Role = "maman" | "professionnel";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [role, setRole] = useState<Role>("maman");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    specialite: "",
  });
  const [loading, setLoading] = useState(false);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert("Champs requis", "Nom, email et mot de passe sont requis");
      return;
    }
    if (form.password.length < 6) {
      Alert.alert("Mot de passe", "Minimum 6 caractères");
      return;
    }
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone || undefined,
        specialite: role === "professionnel" ? form.specialite : undefined,
        role,
      });
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
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="register-back-btn">
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>Rejoignez la communauté À lo Maman</Text>

          <Text style={styles.sectionLabel}>Je suis</Text>
          <View style={styles.roleRow}>
            <RoleCard
              active={role === "maman"}
              onPress={() => setRole("maman")}
              icon="heart"
              label="Maman"
              sub="Suivi grossesse et enfants"
              testID="role-maman"
            />
            <RoleCard
              active={role === "professionnel"}
              onPress={() => setRole("professionnel")}
              icon="medical"
              label="Professionnel"
              sub="Médecin, sage-femme..."
              testID="role-pro"
            />
          </View>

          <Field label="Nom complet" icon="person-outline" testID="reg-name">
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => update("name", v)}
              placeholder="Votre nom"
              placeholderTextColor={COLORS.textMuted}
              testID="reg-name-input"
            />
          </Field>

          <Field label="Email" icon="mail-outline" testID="reg-email">
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(v) => update("email", v)}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="vous@exemple.com"
              placeholderTextColor={COLORS.textMuted}
              testID="reg-email-input"
            />
          </Field>

          <Field label="Mot de passe" icon="lock-closed-outline" testID="reg-pw">
            <TextInput
              style={styles.input}
              value={form.password}
              onChangeText={(v) => update("password", v)}
              secureTextEntry
              placeholder="Min. 6 caractères"
              placeholderTextColor={COLORS.textMuted}
              testID="reg-password-input"
            />
          </Field>

          <Field label="Téléphone (optionnel)" icon="call-outline" testID="reg-phone">
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(v) => update("phone", v)}
              keyboardType="phone-pad"
              placeholder="+228 90 00 00 00"
              placeholderTextColor={COLORS.textMuted}
              testID="reg-phone-input"
            />
          </Field>

          {role === "professionnel" && (
            <Field label="Spécialité" icon="briefcase-outline" testID="reg-spec">
              <TextInput
                style={styles.input}
                value={form.specialite}
                onChangeText={(v) => update("specialite", v)}
                placeholder="Gynécologue, Pédiatre..."
                placeholderTextColor={COLORS.textMuted}
                testID="reg-specialite-input"
              />
            </Field>
          )}

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleRegister}
            disabled={loading}
            testID="register-submit-btn"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>Créer mon compte</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Déjà un compte ? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="goto-login-link">
                <Text style={styles.footerLink}>Se connecter</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  icon,
  children,
  testID,
}: {
  label: string;
  icon: any;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color={COLORS.textMuted} />
        {children}
      </View>
    </View>
  );
}

function RoleCard({
  active,
  onPress,
  icon,
  label,
  sub,
  testID,
}: {
  active: boolean;
  onPress: () => void;
  icon: any;
  label: string;
  sub: string;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.roleCard, active && styles.roleCardActive]}
      onPress={onPress}
      testID={testID}
    >
      <View
        style={[
          styles.roleIcon,
          { backgroundColor: active ? "#fff" : COLORS.primaryLight },
        ]}
      >
        <Ionicons name={icon} size={22} color={active ? COLORS.primary : COLORS.primary} />
      </View>
      <Text style={[styles.roleLabel, active && { color: "#fff" }]}>{label}</Text>
      <Text style={[styles.roleSub, active && { color: "#FFE7E0" }]}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.xl, flexGrow: 1, paddingBottom: 60 },
  back: { width: 40, height: 40, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, marginTop: 10 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: SPACING.xl },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 10 },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: SPACING.xl },
  roleCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  roleCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  roleLabel: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 15 },
  roleSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  field: { marginBottom: SPACING.md },
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
    marginTop: SPACING.lg,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: SPACING.lg },
  footerText: { color: COLORS.textSecondary },
  footerLink: { color: COLORS.primary, fontWeight: "700" },
});
