/**
 * Maman — Détail d'une demande à domicile avec offres reçues, validation tarif, paiement.
 */
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";

export default function HomeRequestDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [req, setReq] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/home-request/mine");
      const mine = (r.data || []).find((x: any) => x.id === id);
      setReq(mine || null);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!req) return (
    <SafeAreaView style={styles.loading}><Text>Demande introuvable</Text></SafeAreaView>
  );

  const isUrgence = req.type === "urgence";
  const color = isUrgence ? "#DC2626" : "#F59E0B";
  const proposals = req.proposals || [];

  const acceptProposal = async (propId: string, total: number) => {
    Alert.alert(
      "Accepter ce tarif ?",
      `Vous allez payer ${total.toLocaleString()} F CFA via PayDunya. Le RDV sera annulé sous 30 min si le paiement n'est pas effectué.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Accepter & Payer",
          onPress: async () => {
            setAccepting(propId);
            try {
              const r = await api.post(`/home-request/${id}/accept`, { proposal_id: propId });
              const payUrl = r.data?.payment_url;
              if (payUrl) {
                await WebBrowser.openBrowserAsync(payUrl);
                const tk = r.data?.payment?.token;
                if (tk) { try { await api.post(`/pay/verify/${tk}`); } catch { /* ignore */ } }
                Alert.alert("💳 Paiement", "Si validé, le pro recevra l'adresse et vous serez notifiée.", [{ text: "OK", onPress: () => router.replace("/(tabs)/rdv") }]);
              } else {
                Alert.alert("Erreur", "PayDunya indisponible. Réessayez plus tard depuis vos RDV.");
              }
            } catch (e) { Alert.alert("Erreur", formatError(e)); }
            finally { setAccepting(null); }
          },
        },
      ],
    );
  };

  const cancelReq = async () => {
    Alert.alert("Annuler la demande ?", "Toutes les offres seront perdues.", [
      { text: "Garder", style: "cancel" },
      {
        text: "Annuler", style: "destructive", onPress: async () => {
          try { await api.post(`/home-request/${id}/cancel`, {}); router.back(); }
          catch (e) { Alert.alert("Erreur", formatError(e)); }
        }
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isUrgence ? "🆘 Urgence" : "🏠 Soins domicile"}</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.recap, { borderLeftColor: color }]}>
          <Text style={styles.recapMotif}>{req.motif}</Text>
          <Text style={styles.recapMeta}>📍 Zone {req.zone} · {req.ville || "CI"}</Text>
          {req.preferred_datetime && (
            <Text style={styles.recapMeta}>⏰ {new Date(req.preferred_datetime).toLocaleString("fr-FR")}</Text>
          )}
          <Text style={styles.recapStatus}>Statut : <Text style={{ color, fontWeight: "800" }}>{req.status}</Text></Text>
        </View>

        <Text style={styles.section}>Offres reçues ({proposals.length})</Text>

        {proposals.length === 0 && (
          <View style={styles.empty}>
            <ActivityIndicator color={color} />
            <Text style={styles.emptyTxt}>En attente d'offres des pros...</Text>
          </View>
        )}

        {proposals.map((p: any) => {
          const isAcceptedP = req.accepted_proposal_id === p.id;
          return (
            <View key={p.id} style={[styles.offer, isAcceptedP && { borderColor: "#10B981", borderWidth: 2 }]}>
              <View style={styles.offerHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerName}>{p.pro_name || "Pro"} {p.pro_premium ? "💎" : ""}</Text>
                  {p.pro_specialite && <Text style={styles.offerSpec}>{p.pro_specialite}</Text>}
                </View>
                <Text style={[styles.offerTotal, { color }]}>{(p.total || 0).toLocaleString()} F</Text>
              </View>
              <View style={styles.detailGrid}>
                <DetailRow label="Consultation" value={p.tarif_consultation} />
                <DetailRow label="Déplacement" value={p.frais_deplacement} />
                {!!p.majoration_nuit && <DetailRow label="+ Majoration nuit" value={p.majoration_nuit} highlight />}
                {!!p.majoration_we && <DetailRow label="+ Majoration week-end" value={p.majoration_we} highlight />}
                {!!p.majoration_urgence && <DetailRow label="+ Majoration urgence" value={p.majoration_urgence} highlight />}
              </View>
              {p.message ? <Text style={styles.msg}>💬 {p.message}</Text> : null}
              {req.status === "open" || req.status === "proposed" ? (
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: color }, accepting === p.id && { opacity: 0.6 }]}
                  onPress={() => acceptProposal(p.id, p.total)}
                  disabled={accepting !== null}
                >
                  {accepting === p.id ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
                  <Text style={styles.acceptTxt}>{accepting === p.id ? "Initialisation..." : `Accepter & Payer ${p.total.toLocaleString()} F`}</Text>
                </TouchableOpacity>
              ) : isAcceptedP ? (
                <View style={[styles.acceptBtn, { backgroundColor: "#10B981" }]}>
                  <Ionicons name="checkmark-done" size={18} color="#fff" />
                  <Text style={styles.acceptTxt}>Offre acceptée</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        {(req.status === "open" || req.status === "proposed") && (
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelReq}>
            <Ionicons name="close-circle" size={16} color="#DC2626" />
            <Text style={styles.cancelTxt}>Annuler la demande</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color: highlight ? "#DC2626" : COLORS.textSecondary, fontWeight: highlight ? "700" : "500" }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: highlight ? "#DC2626" : COLORS.textPrimary }}>{value.toLocaleString()} F</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  recap: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, borderLeftWidth: 4, gap: 4, ...SHADOW },
  recapMotif: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  recapMeta: { fontSize: 12, color: COLORS.textSecondary },
  recapStatus: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  section: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  empty: { padding: 24, alignItems: "center", gap: 8 },
  emptyTxt: { color: COLORS.textSecondary, fontSize: 12 },
  offer: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, marginVertical: 4, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  offerHead: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  offerName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  offerSpec: { fontSize: 11, color: COLORS.textSecondary },
  offerTotal: { fontSize: 18, fontWeight: "900" },
  detailGrid: { backgroundColor: "#F9FAFB", padding: 8, borderRadius: 6 },
  msg: { fontSize: 12, color: COLORS.textSecondary, fontStyle: "italic", marginTop: 6, padding: 6, backgroundColor: "#FEF3C7", borderRadius: 6 },
  acceptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: RADIUS.md, gap: 6, marginTop: 8 },
  acceptTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: RADIUS.md, gap: 6, marginTop: 12, borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEE2E2" },
  cancelTxt: { color: "#DC2626", fontWeight: "700", fontSize: 12 },
});
