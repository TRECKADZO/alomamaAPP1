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
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function MotDePasseOublie() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!phone.trim() || !name.trim()) {
      Alert.alert("Champs requis", "Renseignez votre numéro de téléphone ET votre nom.");
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert("Nom invalide", "Entrez votre nom complet (prénom + nom).");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/auth/forgot-password/request", {
        phone: phone.trim(),
        name: name.trim(),
      });
      const devCode = r.data?.dev_code as string | undefined;
      Alert.alert(
        "Code envoyé",
        devCode
          ? `Mode développement : votre code est ${devCode}\n\n(En production, il sera envoyé par SMS)`
          : "Si le compte existe, un code à 6 chiffres a été envoyé par SMS au numéro indiqué. Le code est valable 10 minutes.",
        [
          {
            text: "Continuer",
            onPress: () =>
              router.push({
                pathname: "/(auth)/verifier-code",
                params: { phone: phone.trim() },
              }),
          },
        ],
      );
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
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
            Pour des raisons de sécurité, nous allons vérifier votre identité avant d'envoyer un code par SMS.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Numéro de téléphone du compte</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+225 XX XX XX XX"
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textMuted}
                autoCorrect={false}
                testID="forgot-phone"
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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Envoyer le code par SMS</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/(auth)/login")} style={{ marginTop: 12, alignItems: "center" }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
              Vous vous souvenez ? <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
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
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
