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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function MotDePasseOublie() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(10);
  const [identifierKind, setIdentifierKind] = useState<"email" | "phone">("phone");

  const isEmail = identifier.includes("@");
  const detectedKind: "email" | "phone" = isEmail ? "email" : "phone";

  const submit = async () => {
    if (!identifier.trim() || !name.trim()) {
      Alert.alert("Champs requis", "Renseignez votre email ou téléphone ET votre nom.");
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert("Nom invalide", "Entrez votre nom complet (prénom + nom).");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/auth/forgot-password/request", {
        identifier: identifier.trim(),
        name: name.trim(),
      });
      if (r.data?.verified && r.data?.code) {
        setCode(r.data.code);
        setExpiresIn(r.data.expires_in_minutes || 10);
        setIdentifierKind(r.data.identifier_kind || detectedKind);
      } else {
        Alert.alert(
          "Vérification échouée",
          r.data?.message ||
            "L'email/téléphone et le nom ne correspondent à aucun compte. Vérifiez vos informations.",
        );
      }
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert("Copié ✅", "Le code a été copié dans le presse-papier.");
    } catch {}
  };

  const goNext = () => {
    if (!code) return;
    router.push({
      pathname: "/(auth)/verifier-code",
      params: { identifier: identifier.trim(), prefill: code },
    });
  };

  const restart = () => {
    setCode(null);
    setIdentifier("");
    setName("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="forgot-back">
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Mot de passe oublié</Text>
          <Text style={styles.subtitle}>
            Pour des raisons de sécurité, nous allons vérifier votre identité avant de générer votre code à usage unique.
          </Text>

          {!code && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Email ou numéro de téléphone</Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name={isEmail ? "mail-outline" : "call-outline"}
                    size={18}
                    color={COLORS.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="exemple@mail.com  ou  +225 XX XX XX XX"
                    keyboardType={isEmail ? "email-address" : "phone-pad"}
                    placeholderTextColor={COLORS.textMuted}
                    autoCorrect={false}
                    autoCapitalize="none"
                    testID="forgot-identifier"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Votre nom complet (prénom + nom)</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Tel qu'enregistré sur votre compte"
                    placeholderTextColor={COLORS.textMuted}
                    autoCorrect={false}
                    autoCapitalize="words"
                    testID="forgot-name"
                  />
                </View>
                <Text style={styles.hint}>
                  Saisissez exactement le nom utilisé lors de l'inscription. Les accents et la casse sont ignorés.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={submit}
                disabled={loading}
                testID="forgot-submit"
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Vérifier mon identité</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace("/(auth)/login")}
                style={{ marginTop: 12, alignItems: "center" }}
              >
                <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
                  Vous vous souvenez ? <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Se connecter</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {code && (
            <View>
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.successText}>Identité vérifiée</Text>
              </View>

              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>Votre code à usage unique</Text>
                <View style={styles.codeRow}>
                  {code.split("").map((d, i) => (
                    <View key={i} style={styles.codeBox}>
                      <Text style={styles.codeDigit}>{d}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={copyCode} testID="copy-code-btn">
                  <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.copyBtnText}>Copier le code</Text>
                </TouchableOpacity>
                <Text style={styles.expiresText}>⏱️ Valable {expiresIn} minutes — ne le partagez avec personne.</Text>
              </View>

              <TouchableOpacity style={styles.btnPrimary} onPress={goNext} testID="continue-with-code-btn">
                <Text style={styles.btnPrimaryText}>Continuer</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              <TouchableOpacity onPress={restart} style={{ marginTop: 12, alignItems: "center" }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 13, textDecorationLine: "underline" }}>
                  Changer de compte
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.xl, paddingTop: SPACING.lg, flexGrow: 1 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
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
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 24, lineHeight: 19 },
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
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontStyle: "italic" },
  btnPrimary: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  successText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  codeCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.lg,
    padding: 18,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
    textAlign: "center",
  },
  codeRow: { flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 14 },
  codeBox: {
    width: 44,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  codeDigit: { fontSize: 24, fontWeight: "800", color: COLORS.primary },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderRadius: RADIUS.pill,
    marginBottom: 8,
  },
  copyBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  expiresText: { fontSize: 11, color: COLORS.primary, textAlign: "center", fontWeight: "600", marginTop: 4 },
});
