/**
 * Demande de remboursement 💸 — Maman annule un RDV payé.
 * Politique : >24h=100%, 6-24h=50%, <6h=0%
 * Route: /refund?rdv_id=...
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

export default function Refund() {
  const router = useRouter();
  const { rdv_id } = useLocalSearchParams<{ rdv_id?: string }>();
  const [rdv, setRdv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [raison, setRaison] = useState("");
  const [hoursLeft, setHoursLeft] = useState<number>(0);

  const load = async () => {
    if (!rdv_id) { router.back(); return; }
    setLoading(true);
    try {
      const r = await api.get("/rdv");
      const item = (r.data || []).find((x: any) => x.id === rdv_id);
      setRdv(item || null);
      if (item) {
        const dt = new Date(item.date);
        const diff = (dt.getTime() - Date.now()) / 3600000;
        setHoursLeft(Math.max(0, diff));
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [rdv_id]);

  const refundRate = hoursLeft >= 24 ? 1.0 : (hoursLeft >= 6 ? 0.5 : 0.0);
  const ruleLabel = hoursLeft >= 24 ? "100% remboursé (>24h)" : (hoursLeft >= 6 ? "50% remboursé (6-24h)" : "0% remboursé (<6h)");
  const expectedRefund = Math.round((rdv?.tarif_total_fcfa || rdv?.tarif_fcfa || 0) * refundRate);
  const refundColor = refundRate === 1 ? "#10B981" : (refundRate === 0.5 ? "#F59E0B" : "#EF4444");

  const submit = async () => {
    if (!rdv) return;
    setSubmitting(true);
    try {
      const r = await api.post("/pay/refund", { rdv_id: rdv.id, raison });
      Alert.alert(
        "Demande envoyée ✅",
        `Règle appliquée : ${r.data?.rule}\nMontant remboursé : ${(r.data?.refund_amount_fcfa || 0).toLocaleString()} F CFA`,
        [{ text: "OK", onPress: () => router.replace("/(tabs)/rdv") }]
      );
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  if (!rdv) return <SafeAreaView style={styles.loading}><Text>RDV introuvable</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EF4444", "#B91C1C"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Annulation & remboursement</Text>
          <Text style={styles.sub}>RDV du {new Date(rdv.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Montant payé</Text>
          <Text style={styles.summaryValue}>{(rdv.tarif_total_fcfa || rdv.tarif_fcfa || 0).toLocaleString()} F CFA</Text>
          <Text style={styles.summarySub}>Mode : {rdv.mode === "domicile" ? "🏠 À domicile" : (rdv.mode === "teleconsultation" ? "📹 Téléconsultation" : "🏥 Au cabinet")}</Text>
        </View>

        <View style={[styles.refundCard, { borderLeftColor: refundColor }]}>
          <View style={[styles.refundIcon, { backgroundColor: refundColor }]}>
            <Ionicons name={refundRate === 1 ? "checkmark" : refundRate === 0.5 ? "alert" : "close"} size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.refundRule}>{ruleLabel}</Text>
            <Text style={styles.refundAmount}>Remboursement attendu : <Text style={{ color: refundColor, fontWeight: "800" }}>{expectedRefund.toLocaleString()} F</Text></Text>
            <Text style={styles.refundDelay}>Temps restant avant le RDV : {Math.floor(hoursLeft)}h{Math.round((hoursLeft % 1) * 60)}min</Text>
          </View>
        </View>

        <Text style={styles.policyTitle}>📋 Politique de remboursement</Text>
        <PolicyRow rate="100%" delay=">24h avant" color="#10B981" active={refundRate === 1} />
        <PolicyRow rate="50%" delay="6 à 24h avant" color="#F59E0B" active={refundRate === 0.5} />
        <PolicyRow rate="0%" delay="<6h avant" color="#EF4444" active={refundRate === 0} />

        <Text style={styles.policyTitle}>Raison de l'annulation (facultatif)</Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          multiline
          placeholder="Ex : Empêchée, urgence familiale…"
          placeholderTextColor={COLORS.textMuted}
          value={raison}
          onChangeText={setRaison}
        />

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} disabled={submitting} onPress={submit}>
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Confirmer l'annulation</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.disclaimer}>⚠️ Cette action est irréversible. Le remboursement sera traité sous 3-5 jours ouvrés sur votre Mobile Money d'origine.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PolicyRow({ rate, delay, color, active }: { rate: string; delay: string; color: string; active: boolean }) {
  return (
    <View style={[stylesP.row, active && { backgroundColor: color + "15", borderColor: color }]}>
      <View style={[stylesP.rate, { backgroundColor: color }]}><Text style={stylesP.rateText}>{rate}</Text></View>
      <Text style={[stylesP.delay, active && { color, fontWeight: "800" }]}>{delay}</Text>
      {active && <Ionicons name="checkmark-circle" size={18} color={color} />}
    </View>
  );
}

const stylesP = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  rate: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  rateText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  delay: { flex: 1, fontSize: 12, color: COLORS.textPrimary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  summaryCard: { backgroundColor: COLORS.surface, padding: 16, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary },
  summaryValue: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  summarySub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  refundCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 4, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  refundIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  refundRule: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  refundAmount: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  refundDelay: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  policyTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, marginTop: 14 },
  input: { borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 8, fontSize: 13, color: COLORS.textPrimary, backgroundColor: "#fff", marginBottom: 12 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, backgroundColor: "#EF4444", borderRadius: RADIUS.md, ...SHADOW },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 12, lineHeight: 16 },
});
