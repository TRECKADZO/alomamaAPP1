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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

/**
 * Page PUBLIQUE de demande de suppression de compte (sans authentification requise).
 * URL : https://<domain>/suppression-compte
 * Conformité Google Play Store + Apple App Store (lien public obligatoire).
 *
 * Deux modes :
 *  - Mode "in-app" : informe que l'utilisateur connecté peut supprimer via Profil
 *  - Mode "à distance" : formulaire de demande pour les utilisateurs qui ne peuvent plus se connecter
 *    (saisie email/téléphone + nom + raison → l'admin reçoit la demande et supprime sous 30 jours)
 */
export default function SuppressionComptePublic() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !name.trim()) {
      Alert.alert("Champs requis", "Indiquez votre email/téléphone et votre nom complet.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/public/account-deletion-request", {
        identifier: identifier.trim(),
        name: name.trim(),
        reason: reason.trim() || null,
      });
      setSubmitted(true);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headTitle}>Suppression de compte</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Bannière info */}
          <View style={styles.iconWrap}>
            <Ionicons name="trash-outline" size={36} color={COLORS.error} />
          </View>
          <Text style={styles.title}>Supprimer votre compte À lo Maman</Text>
          <Text style={styles.subtitle}>
            Conformément à l'article 17 du RGPD (droit à l'effacement), vous pouvez demander la suppression
            définitive de votre compte et de vos données personnelles à tout moment.
          </Text>

          {/* Méthode 1 : In-app */}
          <View style={styles.methodCard}>
            <View style={styles.methodHead}>
              <View style={[styles.methodIcon, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="phone-portrait" size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodTitle}>Méthode 1 — Dans l'application</Text>
                <Text style={styles.methodSub}>Suppression immédiate (recommandé)</Text>
              </View>
            </View>
            <Text style={styles.methodSteps}>
              1. Ouvrez l'application À lo Maman et connectez-vous{"\n"}
              2. Allez dans l'onglet <Text style={styles.bold}>Profil</Text>{"\n"}
              3. Faites défiler jusqu'en bas et tapez <Text style={styles.bold}>« Supprimer mon compte »</Text>{"\n"}
              4. Confirmez avec votre mot de passe
            </Text>
          </View>

          {/* Méthode 2 : Formulaire à distance */}
          {!submitted ? (
            <View style={styles.methodCard}>
              <View style={styles.methodHead}>
                <View style={[styles.methodIcon, { backgroundColor: "#FEF2F2" }]}>
                  <Ionicons name="mail" size={20} color={COLORS.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>Méthode 2 — Demande à distance</Text>
                  <Text style={styles.methodSub}>Si vous ne pouvez plus vous connecter</Text>
                </View>
              </View>
              <Text style={styles.methodSteps}>
                Remplissez ce formulaire. Notre équipe traitera votre demande sous 30 jours et vous
                confirmera la suppression par email/SMS.
              </Text>

              <Text style={styles.label}>Email ou numéro de téléphone du compte *</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="exemple@mail.com  ou  +225 XX XX XX XX"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={identifier.includes("@") ? "email-address" : "default"}
                editable={!loading}
              />

              <Text style={styles.label}>Nom complet *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Tel qu'enregistré sur votre compte"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
              />

              <Text style={styles.label}>Raison (optionnel)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                value={reason}
                onChangeText={setReason}
                placeholder="Aidez-nous à améliorer en partageant votre raison..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                editable={!loading}
              />

              <TouchableOpacity style={styles.btnDanger} onPress={submit} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.btnDangerText}>Envoyer ma demande de suppression</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.methodCard, { backgroundColor: "#ECFDF5", borderColor: "#10B981" }]}>
              <View style={styles.methodHead}>
                <Ionicons name="checkmark-circle" size={32} color="#059669" />
                <Text style={[styles.methodTitle, { color: "#065F46", marginLeft: 10 }]}>Demande enregistrée ✓</Text>
              </View>
              <Text style={[styles.methodSteps, { color: "#065F46" }]}>
                Nous avons bien reçu votre demande de suppression.{"\n\n"}
                Notre équipe la traitera sous 30 jours maximum (généralement 7 jours ouvrés).{"\n\n"}
                Vous recevrez une confirmation par email/SMS une fois la suppression effective.
              </Text>
            </View>
          )}

          {/* Détails RGPD */}
          <Text style={styles.sectionTitle}>📋 Données qui seront supprimées</Text>
          <View style={styles.dataCard}>
            {[
              "Profil (nom, email, téléphone, photo)",
              "Suivi de grossesse + mesures + plan de naissance",
              "Profils enfants + carnet de santé + croissance",
              "Rendez-vous, messages et notifications",
              "Cycles menstruels et données de contraception",
              "Téléconsultations et notes médicales",
              "Préférences et historique d'utilisation",
            ].map((item, i) => (
              <View key={i} style={styles.dataRow}>
                <Ionicons name="close-circle" size={16} color={COLORS.error} />
                <Text style={styles.dataText}>{item}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>📂 Données conservées (obligation légale)</Text>
          <View style={styles.dataCard}>
            {[
              "Factures et reçus de paiement (anonymisés) — 10 ans (Code Général des Impôts CI)",
              "Logs de sécurité critiques (accès admin) — 1 an",
            ].map((item, i) => (
              <View key={i} style={styles.dataRow}>
                <Ionicons name="archive-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.dataTextMuted}>{item}</Text>
              </View>
            ))}
            <Text style={styles.legalNote}>
              Ces données sont anonymisées (nom, email, téléphone retirés) et ne servent qu'à respecter les
              obligations comptables et fiscales.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>📞 Besoin d'aide ?</Text>
          <View style={styles.contactCard}>
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL("mailto:support@alomaman.com?subject=Suppression%20de%20compte")}
            >
              <Ionicons name="mail" size={18} color={COLORS.primary} />
              <Text style={styles.contactText}>support@alomaman.com</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            À lo Maman · Plateforme de santé maternelle et pédiatrique{"\n"}
            République de Côte d'Ivoire · Conforme RGPD & loi n° 2013-450
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg, paddingBottom: 4 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },

  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, marginBottom: 20, lineHeight: 19 },

  methodCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  methodHead: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  methodIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 10 },
  methodTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  methodSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  methodSteps: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 20, marginTop: 4 },
  bold: { fontWeight: "800" },

  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 12, marginBottom: 6 },
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
  btnDanger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.pill,
    paddingVertical: 14,
    marginTop: 16,
  },
  btnDangerText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 16, marginBottom: 8 },
  dataCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  dataRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 },
  dataText: { flex: 1, fontSize: 12, color: COLORS.textPrimary, lineHeight: 17 },
  dataTextMuted: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  legalNote: { fontSize: 11, color: COLORS.textMuted, marginTop: 10, fontStyle: "italic", lineHeight: 16 },

  contactCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  contactRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  contactText: { flex: 1, color: COLORS.primary, fontWeight: "700", fontSize: 14 },

  footer: { textAlign: "center", color: COLORS.textMuted, fontSize: 11, marginTop: 24, lineHeight: 16 },
});
