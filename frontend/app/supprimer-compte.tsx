import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function SupprimerCompte() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const consequences = [
    "Toutes vos données personnelles seront effacées (profil, photo, contacts).",
    "Votre suivi de grossesse, vos enfants et leurs mesures seront supprimés.",
    "Tous vos rendez-vous, messages et notifications seront effacés.",
    "Vos abonnements premium seront résiliés (sans remboursement).",
    "Cette action est définitive et IRRÉVERSIBLE.",
  ];

  const proceedToStep2 = () => setStep(2);

  const submit = async () => {
    if (loading) return;
    if (!password) {
      Alert.alert("Mot de passe requis", "Saisissez votre mot de passe pour confirmer.");
      return;
    }
    if (confirmText.trim().toUpperCase() !== "SUPPRIMER") {
      Alert.alert("Confirmation incorrecte", "Tapez exactement le mot SUPPRIMER pour confirmer.");
      return;
    }
    setLoading(true);
    try {
      await api.delete("/auth/me", {
        data: { password, confirmation: "SUPPRIMER" },
      });
      // Succès → déconnecter et rediriger immédiatement
      router.replace("/");
      try { await logout(); } catch {}
      setTimeout(() => {
        Alert.alert(
          "Compte supprimé",
          "Votre compte et vos données personnelles ont été supprimés. Merci d'avoir utilisé À lo Maman.",
        );
      }, 300);
    } catch (e: any) {
      const msg = formatError(e);
      Alert.alert("Erreur", msg);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => (loading ? null : router.back())} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Supprimer mon compte</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.warningCard}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning" size={32} color="#fff" />
            </View>
            <Text style={styles.warningTitle}>Action irréversible</Text>
            <Text style={styles.warningText}>
              La suppression de votre compte est définitive. Toutes vos données personnelles seront effacées
              conformément au RGPD. Vous ne pourrez pas les récupérer.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Conséquences de la suppression</Text>
          <View style={styles.consequencesCard}>
            {consequences.map((c, i) => (
              <View key={i} style={styles.consequenceRow}>
                <Ionicons name="close-circle" size={18} color={COLORS.error} />
                <Text style={styles.consequenceText}>{c}</Text>
              </View>
            ))}
          </View>

          <View style={styles.legalNote}>
            <Ionicons name="information-circle" size={16} color={COLORS.textSecondary} />
            <Text style={styles.legalText}>
              Conformément à la loi, certaines données comptables (factures, paiements) sont conservées sous
              forme anonymisée pendant la durée légale (5 à 10 ans).
            </Text>
          </View>

          {step === 1 && (
            <>
              <TouchableOpacity style={styles.btnCancel} onPress={() => router.back()}>
                <Text style={styles.btnCancelText}>Non, garder mon compte</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnDangerOutline} onPress={proceedToStep2}>
                <Ionicons name="trash" size={18} color={COLORS.error} />
                <Text style={styles.btnDangerOutlineText}>Continuer la suppression</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmTitle}>Confirmation finale</Text>
              <Text style={styles.confirmSubtitle}>
                Compte : <Text style={{ fontWeight: "700" }}>{user?.email}</Text>
              </Text>

              <Text style={styles.formLabel}>Votre mot de passe</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mot de passe"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                testID="delete-password-input"
              />

              <Text style={styles.formLabel}>Tapez SUPPRIMER pour confirmer</Text>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder="SUPPRIMER"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
                testID="delete-confirm-input"
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnCancelInline]}
                  onPress={() => {
                    setStep(1);
                    setPassword("");
                    setConfirmText("");
                  }}
                  disabled={loading}
                >
                  <Text style={styles.btnCancelInlineText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnDanger]}
                  onPress={submit}
                  disabled={loading}
                  testID="delete-account-confirm-btn"
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnDangerText}>Supprimer définitivement</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  warningCard: {
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: "center",
    marginBottom: 18,
  },
  warningIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  warningTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 6 },
  warningText: { color: "rgba(255,255,255,0.95)", fontSize: 13, textAlign: "center", lineHeight: 19 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8, marginTop: 4 },
  consequencesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  consequenceRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  consequenceText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },

  legalNote: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.sm,
    marginTop: 12,
    alignItems: "flex-start",
  },
  legalText: { flex: 1, color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },

  btnCancel: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    alignItems: "center",
  },
  btnCancelText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  btnDangerOutline: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.error,
  },
  btnDangerOutlineText: { color: COLORS.error, fontWeight: "700", fontSize: 13 },

  confirmBox: {
    marginTop: 18,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  confirmTitle: { fontSize: 15, fontWeight: "800", color: COLORS.error, marginBottom: 4 },
  confirmSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },
  formLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  btn: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", minHeight: 44 },
  btnCancelInline: { backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border },
  btnCancelInlineText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  btnDanger: { backgroundColor: COLORS.error },
  btnDangerText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
