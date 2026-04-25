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
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function NouveauMotDePasse() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (pw.length < 6) {
      Alert.alert("Mot de passe trop court", "Au moins 6 caractères");
      return;
    }
    if (pw !== pw2) {
      Alert.alert("Erreur", "Les deux mots de passe ne correspondent pas");
      return;
    }
    if (!token) {
      Alert.alert("Erreur", "Lien invalide. Recommencez.");
      router.replace("/(auth)/mot-de-passe-oublie");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password/reset", { reset_token: token, new_password: pw });
      Alert.alert(
        "✅ Mot de passe modifié",
        "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
        [{ text: "Se connecter", onPress: () => router.replace("/(auth)/login") }],
      );
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const score = passwordStrength(pw);
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="key" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Nouveau mot de passe</Text>
          <Text style={styles.subtitle}>Choisissez un mot de passe fort que vous ne partagerez avec personne.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nouveau mot de passe</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={pw}
                onChangeText={setPw}
                secureTextEntry={!show}
                placeholder="Au moins 6 caractères"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                testID="new-password"
              />
              <TouchableOpacity onPress={() => setShow((s) => !s)}>
                <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            {pw.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={[styles.strengthBar, { backgroundColor: score.color, width: `${(score.value / 4) * 100}%` }]} />
                <Text style={[styles.strengthLabel, { color: score.color }]}>{score.label}</Text>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirmez le mot de passe</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="checkmark-done-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={pw2}
                onChangeText={setPw2}
                secureTextEntry={!show}
                placeholder="Retapez votre mot de passe"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                testID="confirm-password"
              />
            </View>
            {pw2.length > 0 && pw !== pw2 && <Text style={styles.errorText}>Les mots de passe ne correspondent pas</Text>}
          </View>

          <TouchableOpacity style={styles.btnPrimary} onPress={submit} disabled={loading} testID="reset-submit">
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Modifier le mot de passe</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function passwordStrength(pw: string) {
  let v = 0;
  if (pw.length >= 6) v++;
  if (pw.length >= 10) v++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) v++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) v++;
  const colors = ["#DC2626", "#EF4444", "#F59E0B", "#10B981", "#059669"];
  const labels = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"];
  return { value: v, color: colors[v], label: labels[v] };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.xl, paddingTop: SPACING.xl + 10, flexGrow: 1 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 24 },
  field: { marginBottom: 14 },
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
  errorText: { color: "#DC2626", fontSize: 11, marginTop: 6 },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  strengthBar: { height: 4, borderRadius: 2, flex: 1, maxWidth: 200 },
  strengthLabel: { fontSize: 11, fontWeight: "700" },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
