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
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function ChangerMotDePasse() {
  const router = useRouter();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!oldPw || !newPw) {
      Alert.alert("Champs requis", "Renseignez votre mot de passe actuel et le nouveau.");
      return;
    }
    if (newPw.length < 6) {
      Alert.alert("Mot de passe trop court", "Au moins 6 caractères pour le nouveau mot de passe.");
      return;
    }
    if (newPw === oldPw) {
      Alert.alert("Mot de passe identique", "Le nouveau mot de passe doit être différent de l'ancien.");
      return;
    }
    if (newPw !== newPw2) {
      Alert.alert("Erreur", "Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { old_password: oldPw, new_password: newPw });
      Alert.alert("✅ Mot de passe modifié", "Votre mot de passe a été changé avec succès.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headTitle}>Sécurité</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Changer mon mot de passe</Text>
          <Text style={styles.subtitle}>
            Choisissez un mot de passe fort. Évitez de réutiliser celui d'autres comptes.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Mot de passe actuel</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={oldPw}
                onChangeText={setOldPw}
                secureTextEntry={!show}
                placeholder="Mot de passe actuel"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                testID="old-password"
              />
              <TouchableOpacity onPress={() => setShow((s) => !s)}>
                <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Nouveau mot de passe</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="key-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={newPw}
                onChangeText={setNewPw}
                secureTextEntry={!show}
                placeholder="Au moins 6 caractères"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                testID="new-password"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="checkmark-done-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={newPw2}
                onChangeText={setNewPw2}
                secureTextEntry={!show}
                placeholder="Retapez le nouveau mot de passe"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                testID="confirm-new-password"
              />
            </View>
            {newPw2.length > 0 && newPw !== newPw2 && (
              <Text style={styles.errorText}>Les nouveaux mots de passe ne correspondent pas.</Text>
            )}
          </View>

          <TouchableOpacity style={styles.btnPrimary} onPress={submit} disabled={loading} testID="change-pw-submit">
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Enregistrer</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    paddingBottom: 4,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  scroll: { padding: SPACING.xl, paddingTop: 0, flexGrow: 1 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 18 },
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
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  cancelText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
});
