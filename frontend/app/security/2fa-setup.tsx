/**
 * 2FA Setup — Active la double authentification (Google Authenticator)
 * Route: /security/2fa-setup
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function TwoFASetup() {
  const router = useRouter();
  const [status, setStatus] = useState<{ enabled: boolean; required_for_role: boolean } | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string; label: string } | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const loadStatus = async () => {
    try {
      const r = await api.get("/auth/2fa/status");
      setStatus(r.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadStatus(); }, []);

  const startSetup = async () => {
    setSubmitting(true);
    try {
      const r = await api.post("/auth/2fa/setup");
      setSetupData(r.data);
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible de démarrer le 2FA");
    } finally { setSubmitting(false); }
  };

  const verify = async () => {
    if (!code || code.length < 6) {
      Alert.alert("Code requis", "Entrez le code à 6 chiffres affiché par votre application Authenticator");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/2fa/verify", { code });
      Alert.alert("✅ 2FA activée", "Votre compte est maintenant protégé par double authentification", [
        { text: "OK", onPress: () => router.back() }
      ]);
      setSetupData(null);
      setCode("");
      loadStatus();
    } catch (e: any) {
      Alert.alert("Code invalide", e?.response?.data?.detail || "Vérifiez le code et l'heure de votre téléphone");
    } finally { setSubmitting(false); }
  };

  const disable = async () => {
    Alert.prompt?.(
      "Désactiver 2FA",
      "Confirmez avec votre code à 6 chiffres actuel",
      async (otp: string) => {
        if (!otp) return;
        try {
          await api.post("/auth/2fa/disable", { code: otp });
          Alert.alert("2FA désactivée");
          loadStatus();
        } catch (e: any) { Alert.alert("Erreur", e?.response?.data?.detail || "Code invalide"); }
      },
      "plain-text"
    ) || (async () => {
      // Fallback web
      const otp = window.prompt("Code 6 chiffres");
      if (!otp) return;
      try { await api.post("/auth/2fa/disable", { code: otp }); loadStatus(); Alert.alert("2FA désactivée"); }
      catch (e: any) { Alert.alert("Erreur", e?.response?.data?.detail || "Code invalide"); }
    })();
  };

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#6366F1", "#3B82F6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🔐 Authentification 2 facteurs</Text>
          <Text style={styles.sub}>RGSSI Niveau 3 — B.7 Contrôle d'accès</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {/* ⚠️ Bandeau Phase de Test */}
        <View style={styles.testBanner}>
          <Ionicons name="information-circle" size={22} color="#92400E" />
          <Text style={styles.testBannerText}>
            Phase de test : la 2FA est <Text style={{ fontWeight: "800" }}>optionnelle</Text>. Vous pouvez vous connecter normalement sans code.
          </Text>
        </View>

        {/* Statut actuel */}
        <View style={[styles.statusCard, status?.enabled ? styles.statusOk : styles.statusOff]}>
          <Ionicons name={status?.enabled ? "shield-checkmark" : "shield-outline"} size={28} color={status?.enabled ? "#10B981" : "#EF4444"} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: status?.enabled ? "#065F46" : "#7F1D1D" }]}>
              {status?.enabled ? "2FA activée" : "2FA désactivée"}
            </Text>
            <Text style={styles.statusSub}>
              Optionnelle pendant la phase de test — recommandée à l'avenir
            </Text>
          </View>
        </View>

        {!status?.enabled && !setupData && (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>📱 Comment ça marche ?</Text>
              <Text style={styles.infoStep}>1️⃣ Installez Google Authenticator (ou Microsoft Authenticator) sur votre téléphone</Text>
              <Text style={styles.infoStep}>2️⃣ Scannez le QR code que nous vous montrerons</Text>
              <Text style={styles.infoStep}>3️⃣ Entrez le code à 6 chiffres pour activer</Text>
              <Text style={styles.infoStep}>4️⃣ À chaque connexion, on vous demandera ce code</Text>
            </View>
            <TouchableOpacity style={styles.btnPrimary} onPress={startSetup} disabled={submitting} testID="btn-start-2fa">
              {submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="qr-code" size={20} color="#fff" /><Text style={styles.btnText}>Activer 2FA</Text></>}
            </TouchableOpacity>
          </>
        )}

        {setupData && (
          <>
            <Text style={styles.scanLabel}>📸 Scannez ce QR code dans Google Authenticator</Text>
            <View style={styles.qrWrap}>
              <QRCode value={setupData.otpauth_url} size={220} />
            </View>
            <TouchableOpacity onPress={() => setShowSecret(!showSecret)} style={styles.linkBtn}>
              <Text style={styles.linkText}>{showSecret ? "Masquer" : "Afficher"} le secret manuel</Text>
            </TouchableOpacity>
            {showSecret && <Text style={styles.secret}>{setupData.secret}</Text>}

            <Text style={[styles.scanLabel, { marginTop: 24 }]}>🔢 Code à 6 chiffres</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor={COLORS.textMuted}
              maxLength={6}
              testID="input-totp-code"
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={verify} disabled={submitting || code.length < 6} testID="btn-verify-2fa">
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Vérifier et activer</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSetupData(null)} style={styles.linkBtn}>
              <Text style={styles.linkTextMuted}>Annuler</Text>
            </TouchableOpacity>
          </>
        )}

        {status?.enabled && (
          <TouchableOpacity style={styles.btnDanger} onPress={disable}>
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={styles.btnText}>Désactiver 2FA</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: RADIUS.md, marginBottom: 16 },
  statusOk: { backgroundColor: "#D1FAE5" },
  statusOff: { backgroundColor: "#FEE2E2" },
  statusTitle: { fontSize: 15, fontWeight: "800" },
  statusSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  testBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: RADIUS.md, marginBottom: 14, backgroundColor: "#FEF3C7", borderLeftWidth: 3, borderLeftColor: "#F59E0B" },
  testBannerText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  infoCard: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 3, borderLeftColor: "#3B82F6", marginBottom: 16 },
  infoTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  infoStep: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, lineHeight: 17 },

  scanLabel: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  qrWrap: { alignItems: "center", padding: 18, backgroundColor: "#fff", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  secret: { fontSize: 14, fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }), backgroundColor: "#F3F4F6", padding: 10, borderRadius: 8, textAlign: "center", letterSpacing: 1, marginTop: 6 },

  codeInput: { fontSize: 28, fontWeight: "900", textAlign: "center", letterSpacing: 8, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },

  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3B82F6", padding: 14, borderRadius: RADIUS.md, ...SHADOW },
  btnDanger: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", padding: 14, borderRadius: RADIUS.md, marginTop: 12 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  linkBtn: { padding: 10, alignItems: "center" },
  linkText: { color: "#3B82F6", fontSize: 12, fontWeight: "700" },
  linkTextMuted: { color: COLORS.textMuted, fontSize: 12 },
});
