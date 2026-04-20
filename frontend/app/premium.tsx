import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
  Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { api, formatError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Premium() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    try { const { data } = await api.get("/pay/history"); setHistory(data); } catch {}
  };

  useEffect(() => { loadHistory(); }, []);

  const startPayment = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/pay/subscribe", { months });
      if (data.success && data.payment_url) {
        setPayToken(data.payment.token);
        setPayUrl(data.payment_url);
      } else {
        Alert.alert("PayDunya non configuré", data.error || "Les clés PayDunya doivent être ajoutées dans /app/backend/.env (PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN).");
      }
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    if (!payToken) return;
    try {
      const { data } = await api.post(`/pay/verify/${payToken}`);
      if (data.status === "completed") {
        setPayUrl(null);
        Alert.alert("Paiement confirmé ✅", "Votre abonnement Premium est activé.");
        await refresh();
        loadHistory();
      } else {
        Alert.alert("En attente", `Statut PayDunya: ${data.paydunya_status || data.status}`);
      }
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const openExternal = () => {
    if (payUrl && typeof window !== "undefined") window.open(payUrl, "_blank");
  };

  const isPremium = user?.premium && user?.premium_until && new Date(user.premium_until) > new Date();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Maman Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {isPremium ? (
          <View style={[styles.heroCard, { backgroundColor: COLORS.success }]}>
            <Ionicons name="star" size={36} color="#fff" />
            <Text style={styles.heroTitle}>Vous êtes Premium ✨</Text>
            <Text style={styles.heroSub}>Actif jusqu'au {new Date(user!.premium_until!).toLocaleDateString("fr-FR")}</Text>
          </View>
        ) : (
          <View style={styles.heroCard}>
            <Ionicons name="diamond" size={36} color="#fff" />
            <Text style={styles.heroTitle}>Débloquez Premium</Text>
            <Text style={styles.heroSub}>2 000 FCFA / mois</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Avantages Premium</Text>
        <Benefit icon="sparkles" text="Assistant IA Claude Sonnet 4.5 illimité" />
        <Benefit icon="videocam" text="Vidéo-consultations prioritaires" />
        <Benefit icon="cloud-download" text="Export FHIR illimité" />
        <Benefit icon="image" text="Stockage photos & échographies" />
        <Benefit icon="notifications" text="Rappels santé automatisés" />
        <Benefit icon="gift" text="Assistance prioritaire 24/7" />

        {!isPremium && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Durée</Text>
            <View style={styles.monthsRow}>
              {[1, 3, 6, 12].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.monthBtn, months === m && styles.monthBtnActive]}
                  onPress={() => setMonths(m)}
                  testID={`months-${m}`}
                >
                  <Text style={[styles.monthValue, months === m && { color: "#fff" }]}>{m}</Text>
                  <Text style={[styles.monthLabel, months === m && { color: "#fff" }]}>mois</Text>
                  <Text style={[styles.monthPrice, months === m && { color: "#fff" }]}>{(2000 * m).toLocaleString()} F</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.payBtn} onPress={startPayment} disabled={loading} testID="pay-subscribe-btn">
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="card" size={20} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Payer {(2000 * months).toLocaleString()} FCFA avec PayDunya</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.disclaimer}>
              PayDunya accepte : Orange Money, MTN MoMo, Wave, Moov, Free Money, carte Visa/Mastercard.
            </Text>
          </>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Historique des paiements</Text>
        {history.length === 0 ? (
          <Text style={styles.empty}>Aucun paiement</Text>
        ) : history.map((p) => (
          <View key={p.id} style={styles.histRow}>
            <Ionicons name={p.kind === "subscription" ? "diamond" : "medical"} size={18} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histKind}>{p.kind === "subscription" ? `Abonnement ${p.months} mois` : "Consultation"}</Text>
              <Text style={styles.histDate}>{new Date(p.created_at).toLocaleDateString("fr-FR")}</Text>
            </View>
            <Text style={styles.histAmount}>{p.amount.toLocaleString()} F</Text>
            <StatusBadge status={p.status} />
          </View>
        ))}
      </ScrollView>

      {/* Payment modal */}
      <Modal visible={!!payUrl} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.payHead}>
            <TouchableOpacity onPress={() => setPayUrl(null)}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
            <Text style={styles.payHeadText}>Paiement PayDunya</Text>
            <TouchableOpacity onPress={verify}><Text style={styles.verifyText}>Vérifier</Text></TouchableOpacity>
          </View>
          {Platform.OS === "web" ? (
            <View style={styles.webFallback}>
              <Ionicons name="card" size={60} color="#fff" />
              <Text style={styles.fallbackTitle}>Paiement en cours</Text>
              <Text style={styles.fallbackText}>Cliquez pour ouvrir la page PayDunya dans un nouvel onglet, puis revenez vérifier votre paiement.</Text>
              <TouchableOpacity style={styles.fallbackBtn} onPress={openExternal}><Text style={styles.fallbackBtnText}>Ouvrir PayDunya</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.fallbackBtn, { backgroundColor: COLORS.success, marginTop: 10 }]} onPress={verify}><Text style={styles.fallbackBtnText}>✓ J'ai payé — vérifier</Text></TouchableOpacity>
            </View>
          ) : (
            payUrl && (
              <WebView
                source={{ uri: payUrl }}
                style={{ flex: 1 }}
                onNavigationStateChange={(nav) => {
                  if (nav.url.includes("/pay/return")) verify();
                }}
              />
            )
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Benefit({ icon, text }: any) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}><Ionicons name={icon} size={18} color={COLORS.primary} /></View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    completed: { bg: "#DCFCE7", fg: COLORS.success, label: "Payé" },
    pending: { bg: "#FFF3E0", fg: "#E88C00", label: "En attente" },
    error: { bg: "#FEE2E2", fg: COLORS.error, label: "Erreur" },
  };
  const c = map[status] || map.pending;
  return <Text style={[styles.stBadge, { backgroundColor: c.bg, color: c.fg }]}>{c.label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  heroCard: { backgroundColor: COLORS.primary, padding: 28, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 20 },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 8 },
  heroSub: { color: "#FFE7E0", marginTop: 4, fontWeight: "600" },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16, marginBottom: 12 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  benefitText: { color: COLORS.textPrimary, flex: 1, fontSize: 14 },
  monthsRow: { flexDirection: "row", gap: 8 },
  monthBtn: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, alignItems: "center", borderWidth: 2, borderColor: COLORS.border },
  monthBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  monthValue: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  monthLabel: { fontSize: 11, color: COLORS.textSecondary, textTransform: "uppercase" },
  monthPrice: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginTop: 4 },
  payBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: RADIUS.pill, marginTop: 16 },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 10, lineHeight: 16 },
  empty: { color: COLORS.textMuted, textAlign: "center", fontStyle: "italic", marginTop: 10 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  histKind: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13 },
  histDate: { color: COLORS.textSecondary, fontSize: 11 },
  histAmount: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  stBadge: { fontSize: 9, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.pill },
  payHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, backgroundColor: "#000" },
  payHeadText: { color: "#fff", fontWeight: "700" },
  verifyText: { color: COLORS.accent, fontWeight: "700" },
  webFallback: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#1a1a1a" },
  fallbackTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 10 },
  fallbackText: { color: "#d1d5db", textAlign: "center", lineHeight: 20 },
  fallbackBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: RADIUS.pill, marginTop: 10 },
  fallbackBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
