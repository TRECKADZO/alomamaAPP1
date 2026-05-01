/**
 * Page Téléconsultation partagée Maman & Pro.
 * Ouvre la salle Jitsi (créée via POST /teleconsultation/room/{rdv_id}).
 */
import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, Linking, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function VideoCall() {
  const { rdvId } = useLocalSearchParams<{ rdvId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [rdv, setRdv] = useState<any | null>(null);

  // Charger les détails du RDV pour afficher le contexte
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/rdv");
        const found = (r.data || []).find((x: any) => x.id === rdvId);
        setRdv(found || null);
        // Si la salle existe déjà → pré-charger l'URL
        if (found?.teleconsultation_url) setRoomUrl(found.teleconsultation_url);
      } catch {}
    })();
  }, [rdvId]);

  const startCall = async () => {
    if (!rdvId) return Alert.alert("Erreur", "Identifiant du RDV manquant");
    setLoading(true);
    try {
      const { data } = await api.post(`/teleconsultation/room/${rdvId}`);
      setRoomUrl(data.room_url);
      // Ouvrir directement
      await Linking.openURL(data.room_url);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setLoading(false); }
  };

  const reopenCall = async () => {
    if (!roomUrl) return;
    try { await Linking.openURL(roomUrl); } catch (e) { Alert.alert("Erreur", String(e)); }
  };

  const isPro = user?.role === "professionnel";
  const isMaman = user?.role === "maman";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Téléconsultation</Text>
          <Text style={styles.sub}>Visio sécurisée — Jitsi Meet</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.iconBig}>
          <Ionicons name="videocam" size={56} color="#fff" />
        </LinearGradient>

        {rdv ? (
          <View style={styles.rdvCard}>
            <Text style={styles.rdvLabel}>RDV programmé</Text>
            <Text style={styles.rdvDate}>
              {new Date(rdv.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {" · "}
              {new Date(rdv.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text style={styles.rdvMotif}>{rdv.motif}</Text>
            <View style={styles.statusBadge}>
              <Ionicons name={rdv.status === "confirme" ? "checkmark-circle" : "time"} size={14} color={rdv.status === "confirme" ? "#16A34A" : "#F59E0B"} />
              <Text style={[styles.statusText, { color: rdv.status === "confirme" ? "#16A34A" : "#F59E0B" }]}>
                {rdv.status === "confirme" ? "Confirmé" : rdv.status === "en_attente" ? "En attente" : rdv.status}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.bigTitle}>
          {roomUrl ? "Salle prête à rejoindre" : (isPro ? "Démarrer la consultation" : "Rejoindre la consultation")}
        </Text>
        <Text style={styles.bigSub}>
          {roomUrl
            ? "La salle est ouverte. Cliquez pour rejoindre la visio sécurisée."
            : (isPro
                ? "Créez la salle de téléconsultation. La patiente recevra automatiquement le lien."
                : "Le praticien va démarrer la consultation. Cliquez ci-dessous pour rejoindre dès qu'il sera prêt.")}
        </Text>

        {!roomUrl ? (
          <TouchableOpacity onPress={startCall} disabled={loading} style={{ marginTop: 24, alignSelf: "stretch" }} testID="start-call-btn">
            <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btn}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="videocam" size={20} color="#fff" />
                  <Text style={styles.btnText}>{isPro ? "Démarrer la consultation" : "Rejoindre la salle"}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={{ width: "100%", gap: 12, marginTop: 24 }}>
            <TouchableOpacity onPress={reopenCall} testID="reopen-call-btn">
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.btn}>
                <Ionicons name="enter" size={20} color="#fff" />
                <Text style={styles.btnText}>Entrer dans la salle</Text>
              </LinearGradient>
            </TouchableOpacity>
            <View style={styles.urlBox}>
              <Text style={styles.urlLabel}>Lien de la salle :</Text>
              <Text style={styles.urlText} selectable>{roomUrl}</Text>
            </View>
          </View>
        )}

        {/* Conseils utilisateur */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>📋 Avant de commencer</Text>
          <Tip icon="wifi" text="Vérifiez votre connexion Internet (3G minimum)" />
          <Tip icon="mic" text="Autorisez l'accès au micro et à la caméra quand votre navigateur le demandera" />
          <Tip icon="headset" text="Utilisez un casque audio pour éviter l'écho" />
          <Tip icon="moon" text="Choisissez un endroit calme et bien éclairé" />
          {isMaman && <Tip icon="document-text" text="Préparez vos questions et votre carnet de santé" />}
          {isPro && <Tip icon="shield-checkmark" text="Confidentialité : aucun enregistrement n'est conservé sur Jitsi" />}
        </View>

        {/* Test connexion */}
        <TouchableOpacity onPress={() => Linking.openURL("https://meet.jit.si/test")} style={styles.testLink}>
          <Ionicons name="play-circle-outline" size={16} color={COLORS.primary} />
          <Text style={styles.testLinkText}>Tester ma connexion (salle de test)</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  body: { padding: SPACING.xl, alignItems: "center" },
  iconBig: { width: 110, height: 110, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  rdvCard: { width: "100%", backgroundColor: COLORS.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  rdvLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700", textTransform: "uppercase" },
  rdvDate: { fontSize: 14, color: COLORS.textPrimary, fontWeight: "800", marginTop: 4 },
  rdvMotif: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: COLORS.bgPrimary },
  statusText: { fontSize: 11, fontWeight: "800" },
  bigTitle: { fontSize: 21, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center", marginTop: 8 },
  bigSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, paddingHorizontal: 10 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 16, borderRadius: RADIUS.pill },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  urlBox: { padding: 12, backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  urlLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700" },
  urlText: { fontSize: 11, color: COLORS.primary, marginTop: 4, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  tipsBox: { width: "100%", padding: 14, backgroundColor: "#EFF6FF", borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE", marginTop: 24 },
  tipsTitle: { fontSize: 14, fontWeight: "800", color: "#1E40AF", marginBottom: 8 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  tipText: { flex: 1, fontSize: 12, color: "#1E40AF" },
  testLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, padding: 10 },
  testLinkText: { color: COLORS.primary, fontWeight: "700", fontSize: 13, textDecorationLine: "underline" },
});
