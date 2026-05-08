/**
 * Adresse domicile patiente 🏠 — Écran Pro pour visualiser l'adresse complète d'un RDV à domicile.
 * Accès : Pro assigné uniquement, RDV payé obligatoire.
 * Route: /pro/rdv-adresse?rdv_id=...
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function ProRdvAdresse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rdv_id?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState<string | null>(null);

  const load = async () => {
    if (!params.rdv_id) {
      Alert.alert("Erreur", "RDV introuvable");
      router.back();
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/rdv/${params.rdv_id}/adresse-domicile`);
      setData(r.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "payment_required") {
        setPaymentRequired(detail.message || "Adresse disponible après paiement.");
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [params.rdv_id]);

  const openMaps = () => {
    if (!data?.adresse) return;
    const q = encodeURIComponent(`${data.adresse}${data.quartier ? ", " + data.quartier : ""}${data.ville ? ", " + data.ville : ""}`);
    let url = "";
    if (data.lat && data.lng) {
      url = Platform.select({
        ios: `maps:0,0?q=${data.lat},${data.lng}`,
        android: `geo:0,0?q=${data.lat},${data.lng}(${q})`,
        default: `https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`,
      }) as string;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${q}`;
    }
    Linking.openURL(url).catch(() => Alert.alert("Erreur", "Impossible d'ouvrir Maps"));
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#F59E0B", "#B45309"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Visite à domicile 🏠</Text>
          <Text style={styles.sub}>Adresse de la patiente</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {paymentRequired ? (
          <View style={styles.paymentBox}>
            <Ionicons name="lock-closed" size={36} color="#F59E0B" />
            <Text style={styles.paymentTitle}>Adresse verrouillée 🔒</Text>
            <Text style={styles.paymentMsg}>{paymentRequired}</Text>
            <Text style={styles.paymentNote}>Dès que la patiente aura payé le RDV, l'adresse complète (incluant le supplement de déplacement) sera visible ici et envoyée par notification.</Text>
          </View>
        ) : data ? (
          <>
            <View style={styles.addrCard}>
              <View style={styles.addrHeader}>
                <Ionicons name="home" size={22} color="#F59E0B" />
                <Text style={styles.addrLabel}>Adresse complète</Text>
              </View>
              <Text style={styles.addrText}>{data.adresse}</Text>
              {(data.quartier || data.ville) && (
                <Text style={styles.addrMeta}>📍 {[data.quartier, data.ville].filter(Boolean).join(" · ")}</Text>
              )}
              {data.frais_deplacement_fcfa > 0 && (
                <View style={styles.feeBox}>
                  <Ionicons name="car" size={14} color="#10B981" />
                  <Text style={styles.feeText}>Frais déplacement encaissés : {data.frais_deplacement_fcfa.toLocaleString()} F CFA</Text>
                </View>
              )}
            </View>

            <TouchableOpacity style={[styles.btn, { backgroundColor: "#3B82F6" }]} onPress={openMaps}>
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.btnText}>Ouvrir dans Maps</Text>
            </TouchableOpacity>

            <View style={styles.tipsBox}>
              <Text style={styles.tipsTitle}>💡 Avant le départ</Text>
              <Text style={styles.tipLine}>• Confirmez votre arrivée par message à la patiente</Text>
              <Text style={styles.tipLine}>• Prévoyez 15-20 min de marge selon le trafic</Text>
              <Text style={styles.tipLine}>• Vérifiez votre kit de consultation à domicile</Text>
              <Text style={styles.tipLine}>• Notez la consultation immédiatement après</Text>
            </View>
          </>
        ) : null}
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
  paymentBox: { alignItems: "center", padding: 24, borderRadius: RADIUS.lg, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FCD34D" },
  paymentTitle: { fontSize: 18, fontWeight: "800", color: "#92400E", marginTop: 12 },
  paymentMsg: { fontSize: 13, color: "#92400E", textAlign: "center", marginTop: 8, lineHeight: 19 },
  paymentNote: { fontSize: 11, color: "#78350F", textAlign: "center", marginTop: 12, lineHeight: 16, paddingHorizontal: 8 },
  addrCard: { backgroundColor: COLORS.surface, padding: 16, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: "#FCD34D", marginBottom: 16 },
  addrHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  addrLabel: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  addrText: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, lineHeight: 22 },
  addrMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
  feeBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 8, backgroundColor: "#D1FAE5", borderRadius: 6 },
  feeText: { fontSize: 11, color: "#065F46", fontWeight: "700" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.md, ...SHADOW },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  tipsBox: { marginTop: 16, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  tipsTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  tipLine: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4, lineHeight: 17 },
});
