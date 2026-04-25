import { useState, useEffect, useRef } from "react";
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

export default function VerifierCode() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const setDigit = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(0, 1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
    if (next.every((d) => d.length === 1)) {
      submit(next.join(""));
    }
  };

  const onKeyPress = (idx: number, key: string) => {
    if (key === "Backspace" && !code[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const submit = async (fullCode?: string) => {
    const c = fullCode || code.join("");
    if (c.length !== 6) {
      Alert.alert("Code incomplet", "Entrez les 6 chiffres reçus par SMS");
      return;
    }
    if (!phone) {
      Alert.alert("Erreur", "Numéro de téléphone manquant. Recommencez.");
      router.replace("/(auth)/mot-de-passe-oublie");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post("/auth/forgot-password/verify", { phone, code: c });
      router.replace({ pathname: "/(auth)/nouveau-mot-de-passe", params: { token: r.data.reset_token } });
    } catch (e) {
      Alert.alert("Code invalide", formatError(e));
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resending || secondsLeft > 0) return;
    setResending(true);
    try {
      Alert.alert(
        "Renvoyer un code",
        "Pour renvoyer un code, vous devez recommencer avec votre nom et téléphone (sécurité).",
        [
          { text: "OK", onPress: () => router.replace("/(auth)/mot-de-passe-oublie") },
        ],
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="chatbubble-ellipses" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Code de vérification</Text>
          <Text style={styles.subtitle}>
            Entrez le code à 6 chiffres envoyé par SMS au numéro {phone || "..."}
          </Text>

          <View style={styles.codeRow}>
            {code.map((d, i) => (
              <TextInput
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={d}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                style={[styles.codeInput, d ? styles.codeFilled : null]}
                autoFocus={i === 0}
                testID={`code-digit-${i}`}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => submit()}
            disabled={loading || code.some((d) => !d)}
            testID="verify-submit"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Vérifier</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={resend} style={styles.resendBtn} disabled={secondsLeft > 0}>
            <Text style={[styles.resendText, secondsLeft > 0 && { color: COLORS.textMuted }]}>
              {secondsLeft > 0 ? `Renvoyer dans ${secondsLeft}s` : "Renvoyer un code"}
            </Text>
          </TouchableOpacity>

          <View style={styles.help}>
            <Ionicons name="information-circle" size={14} color={COLORS.textSecondary} />
            <Text style={styles.helpText}>
              Vous n'avez pas reçu le SMS ? Vérifiez le numéro saisi et le réseau, puis renvoyez un code.
            </Text>
          </View>
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
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 24 },
  codeRow: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginBottom: 24 },
  codeInput: {
    flex: 1,
    height: 60,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  codeFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  resendBtn: { alignItems: "center", paddingVertical: 14 },
  resendText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  help: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.sm, marginTop: 8 },
  helpText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
});
