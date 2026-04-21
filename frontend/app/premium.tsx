import { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
  Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Plan = {
  code: string;
  label: string;
  base_price_fcfa: number;
  color: string;
  icon: any;
  description: string;
  features: string[];
  free_limits: string;
};

type Quote = { months: number; amount: number; discount: number; full_price: number };

export default function Premium() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isPremium, setIsPremium] = useState(false);

  const loadAll = async () => {
    setLoadingInit(true);
    try {
      const [me, hist] = await Promise.all([
        api.get("/plans/me").catch(() => ({ data: null })),
        api.get("/pay/history").catch(() => ({ data: [] })),
      ]);
      if (me.data) {
        setPlan(me.data.plan);
        setQuotes(me.data.quotes || []);
        setIsPremium(!!me.data.is_premium);
      }
      setHistory(hist.data || []);
    } finally {
      setLoadingInit(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const currentQuote = useMemo(
    () => quotes.find((q) => q.months === months) || quotes[0] || null,
    [quotes, months],
  );

  const startPayment = async () => {
    if (!plan || !currentQuote) return;
    setLoading(true);
    try {
      const { data } = await api.post("/pay/subscribe", { months });
      if (data.success && data.payment_url) {
        setPayToken(data.payment.token);
        setPayUrl(data.payment_url);
      } else {
        Alert.alert(
          "PayDunya non configuré",
          data.error ||
            "Les clés PayDunya doivent être ajoutées par l'admin (PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN).",
        );
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!payToken) return;
    try {
      const { data } = await api.post(`/pay/verify/${payToken}`);
      if (data.status === "completed") {
        setPayUrl(null);
        Alert.alert("Paiement confirmé ✅", "Votre abonnement Premium est activé.");
        await refresh();
        loadAll();
      } else {
        Alert.alert("En attente", `Statut PayDunya: ${data.paydunya_status || data.status}`);
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const openExternal = () => {
    if (payUrl && typeof window !== "undefined") (window as any).open(payUrl, "_blank");
  };

  if (loadingInit) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Premium</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: SPACING.xl, alignItems: "center" }}>
          <Ionicons name="diamond-outline" size={60} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Aucun plan Premium pour votre rôle</Text>
          <Text style={styles.emptySub}>
            Le plan Premium est disponible pour les mamans, les professionnels de santé et les centres de santé.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const heroColors: [string, string] = (() => {
    switch (plan.code) {
      case "pro": return ["#0EA5E9", "#0369A1"];
      case "centre": return ["#A855F7", "#7C3AED"];
      default: return ["#EC4899", "#BE185D"];
    }
  })();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{plan.label}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {isPremium ? (
          <LinearGradient colors={[COLORS.success, "#059669"]} style={styles.heroCard}>
            <Ionicons name="star" size={36} color="#fff" />
            <Text style={styles.heroTitle}>Vous êtes Premium ✨</Text>
            <Text style={styles.heroSub}>
              Actif jusqu'au {user?.premium_until ? new Date(user.premium_until).toLocaleDateString("fr-FR") : "—"}
            </Text>
          </LinearGradient>
        ) : (
          <LinearGradient colors={heroColors} style={styles.heroCard}>
            <Ionicons name={plan.icon} size={36} color="#fff" />
            <Text style={styles.heroTitle}>{plan.label}</Text>
            <Text style={styles.heroSub}>{plan.description}</Text>
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>{plan.base_price_fcfa.toLocaleString()} FCFA / mois</Text>
            </View>
          </LinearGradient>
        )}

        <Text style={styles.sectionTitle}>Avantages inclus</Text>
        {plan.features.map((f, i) => (
          <View key={i} style={styles.benefit}>
            <View style={[styles.benefitIcon, { backgroundColor: plan.color + "22" }]}>
              <Ionicons name="checkmark-circle" size={16} color={plan.color} />
            </View>
            <Text style={styles.benefitText}>{f}</Text>
          </View>
        ))}

        <View style={styles.limitsBox}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.limitsText}>{plan.free_limits}</Text>
        </View>

        {!isPremium && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Choisissez votre durée</Text>
            <View style={styles.monthsRow}>
              {quotes.map((q) => {
                const active = months === q.months;
                return (
                  <TouchableOpacity
                    key={q.months}
                    style={[styles.monthBtn, active && { backgroundColor: plan.color, borderColor: plan.color }]}
                    onPress={() => setMonths(q.months)}
                    testID={`months-${q.months}`}
                  >
                    {q.discount > 0 && (
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountText}>-{Math.round(q.discount * 100)}%</Text>
                      </View>
                    )}
                    <Text style={[styles.monthValue, active && { color: "#fff" }]}>{q.months}</Text>
                    <Text style={[styles.monthLabel, active && { color: "#fff" }]}>mois</Text>
                    <Text style={[styles.monthPrice, active && { color: "#fff" }]}>
                      {q.amount.toLocaleString()} F
                    </Text>
                    {q.discount > 0 && (
                      <Text style={[styles.oldPrice, active && { color: "rgba(255,255,255,0.7)" }]}>
                        {q.full_price.toLocaleString()} F
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {currentQuote && (
              <TouchableOpacity
                style={[styles.payBtn, { backgroundColor: plan.color }]}
                onPress={startPayment}
                disabled={loading}
                testID="pay-subscribe-btn"
              >
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="card" size={20} color="#fff" />
                    <Text style={styles.btnPrimaryText}>
                      Payer {currentQuote.amount.toLocaleString()} FCFA avec PayDunya
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
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
            <Ionicons name={p.kind === "subscription" ? "diamond" : "medical"} size={18} color={plan.color} />
            <View style={{ flex: 1 }}>
              <Text style={styles.histKind}>
                {p.kind === "subscription"
                  ? `${p.plan === "pro" ? "Pro" : p.plan === "centre" ? "Centre" : "Maman"} · ${p.months} mois`
                  : "Consultation"}
              </Text>
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
            <TouchableOpacity onPress={() => setPayUrl(null)}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.payHeadText}>Paiement PayDunya</Text>
            <TouchableOpacity onPress={verify}>
              <Text style={styles.verifyText}>Vérifier</Text>
            </TouchableOpacity>
          </View>
          {Platform.OS === "web" ? (
            <View style={styles.webFallback}>
              <Ionicons name="card" size={60} color="#fff" />
              <Text style={styles.fallbackTitle}>Paiement en cours</Text>
              <Text style={styles.fallbackText}>
                Cliquez pour ouvrir la page PayDunya dans un nouvel onglet, puis revenez vérifier votre paiement.
              </Text>
              <TouchableOpacity style={styles.fallbackBtn} onPress={openExternal}>
                <Text style={styles.fallbackBtnText}>Ouvrir PayDunya</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.fallbackBtn, { backgroundColor: COLORS.success, marginTop: 10 }]} onPress={verify}>
                <Text style={styles.fallbackBtnText}>✓ J'ai payé — vérifier</Text>
              </TouchableOpacity>
            </View>
          ) : (
            payUrl && (
              <WebView source={{ uri: payUrl }} style={{ flex: 1 }} />
            )
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "completed" ? COLORS.success : status === "pending" ? "#F59E0B" : "#DC2626";
  const label = status === "completed" ? "Payé" : status === "pending" ? "En attente" : "Échec";
  return <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}><Text style={[styles.statusText, { color }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg, paddingBottom: 0 },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },

  heroCard: { padding: SPACING.xl, borderRadius: RADIUS.lg, alignItems: "center", gap: 6, marginBottom: 20 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 8, textAlign: "center" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 2, textAlign: "center", lineHeight: 19 },
  priceBadge: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.pill, marginTop: 12 },
  priceText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },

  benefit: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  benefitText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },

  limitsBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  limitsText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },

  monthsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  monthBtn: { flex: 1, minWidth: 80, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, alignItems: "center", position: "relative" },
  monthValue: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  monthLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: -2 },
  monthPrice: { fontSize: 12, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  oldPrice: { fontSize: 10, color: COLORS.textMuted, textDecorationLine: "line-through", marginTop: 1 },
  discountBadge: { position: "absolute", top: -6, right: -6, backgroundColor: "#EF4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  discountText: { color: "#fff", fontWeight: "800", fontSize: 9 },

  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: RADIUS.pill, marginTop: 16 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  disclaimer: { color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16 },

  empty: { color: COLORS.textMuted, fontSize: 13, textAlign: "center", padding: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14 },
  emptySub: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },

  histRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  histKind: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  histDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  histAmount: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: "800" },

  payHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  payHeadText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  verifyText: { color: COLORS.success, fontWeight: "800" },

  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 14 },
  fallbackTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 12 },
  fallbackText: { color: "rgba(255,255,255,0.85)", fontSize: 13, textAlign: "center", lineHeight: 19 },
  fallbackBtn: { backgroundColor: "#fff", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  fallbackBtnText: { color: "#000", fontWeight: "800" },
});
