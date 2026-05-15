/**
 * Suivi du développement TND — Détail d'un dépistage (résultat + recommandations).
 */
import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError } from "../../../../lib/api";
import { cachedGet } from "../../../../lib/offline";
import { COLORS, RADIUS, SHADOW } from "../../../../constants/theme";

const LEVEL_COLOR: Record<string, string> = { faible: "#10B981", modere: "#F59E0B", eleve: "#DC2626" };
const LEVEL_EMOJI: Record<string, string> = { faible: "🟢", modere: "🟠", eleve: "🔴" };

export default function TndDetail() {
  const router = useRouter();
  const { id, screeningId } = useLocalSearchParams<{ id: string; screeningId: string }>();
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await cachedGet(`/tnd/screening/${screeningId}`);
        setDoc(r.data);
      } catch (e) { Alert.alert("Erreur", formatError(e)); }
      finally { setLoading(false); }
    })();
  }, [screeningId]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!doc) return <SafeAreaView style={styles.loading}><Text>Introuvable</Text></SafeAreaView>;

  const color = LEVEL_COLOR[doc.level] || "#6B7280";
  const emoji = LEVEL_EMOJI[doc.level] || "⚪";
  const reco = doc.recommandations || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Résultat du dépistage</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Mise en garde obligatoire */}
        <View style={styles.warningBox}>
          <Ionicons name="information-circle" size={22} color="#B45309" />
          <Text style={styles.warningTxt}>
            <Text style={{ fontWeight: "800" }}>Cet outil est un dépistage, il ne remplace pas un diagnostic médical.</Text>{"\n"}Seul un pro de santé peut poser un diagnostic.
          </Text>
        </View>

        {/* Résultat */}
        <View style={[styles.resultBox, { borderLeftColor: color }]}>
          <Text style={[styles.resultLevel, { color }]}>{emoji} {reco.title || doc.level}</Text>
          <Text style={styles.resultScore}>Score : <Text style={{ fontWeight: "800" }}>{doc.score}/20</Text></Text>
          <Text style={styles.resultMsg}>{reco.message}</Text>
          {doc.followup && (
            <View style={styles.finalBox}>
              <Text style={styles.finalLabel}>APRÈS ENTRETIEN DÉTAILLÉ M-CHAT-R/F</Text>
              <Text style={[styles.finalScore, { color: LEVEL_COLOR[doc.followup.level_final] || "#6B7280" }]}>
                {LEVEL_EMOJI[doc.followup.level_final]} Score final : {doc.followup.score_final} ({doc.followup.level_final})
              </Text>
            </View>
          )}
        </View>

        {/* CTA Entretien détaillé M-CHAT-R/F */}
        {(doc.level === "modere" || doc.level === "eleve") && !doc.followup && (
          <TouchableOpacity
            style={styles.followupBtn}
            onPress={() => router.push(`/enfants/${id}/tnd/${screeningId}/followup` as any)}
            testID="tnd-followup-cta"
          >
            <View style={styles.followupIcon}>
              <Ionicons name="chatbubbles" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.followupTitle}>Entretien détaillé M-CHAT-R/F</Text>
              <Text style={styles.followupSub}>
                Confirmer ou écarter les {doc.score} signal{doc.score > 1 ? "aux" : ""} relevé{doc.score > 1 ? "s" : ""} (2-3 questions par item, 🔊 mode vocal disponible)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8B5CF6" />
          </TouchableOpacity>
        )}

        {/* Question(s) critique(s) signalée(s) */}
        {reco.critical_note && (
          <View style={styles.criticalBox}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.criticalTxt}>{reco.critical_note}</Text>
          </View>
        )}

        {/* Actions recommandées */}
        <Text style={styles.section}>✨ Actions recommandées</Text>
        {(reco.actions || []).map((a: string, i: number) => (
          <View key={i} style={styles.actionItem}>
            <View style={[styles.actionDot, { backgroundColor: color }]}><Text style={styles.actionDotTxt}>{i + 1}</Text></View>
            <Text style={styles.actionTxt}>{a}</Text>
          </View>
        ))}

        {/* Bouton Prendre RDV pour modere/eleve */}
        {(doc.level === "modere" || doc.level === "eleve") && (
          <TouchableOpacity
            style={[styles.rdvBtn, { backgroundColor: color }]}
            onPress={() => router.push("/rdv-nouveau" as any)}
            testID="tnd-take-rdv"
          >
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={styles.rdvTxt}>Prendre RDV avec un pédiatre</Text>
          </TouchableOpacity>
        )}

        {/* Méta */}
        <View style={styles.meta}>
          <Text style={styles.metaTxt}>Version : {doc.version}</Text>
          <Text style={styles.metaTxt}>Date : {new Date(doc.created_at).toLocaleString("fr-FR")}</Text>
          <Text style={styles.metaTxt}>Enfant : {doc.enfant_name}</Text>
        </View>

        <Text style={styles.disclaimer}>
          Ce résultat est confidentiel. Vous pouvez le partager avec votre pro de santé lors d'une consultation.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  warningBox: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FCD34D", borderRadius: RADIUS.md, alignItems: "flex-start" },
  warningTxt: { flex: 1, fontSize: 12, color: "#78350F", lineHeight: 17 },
  resultBox: { padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 6, ...SHADOW, gap: 6 },
  resultLevel: { fontSize: 18, fontWeight: "900" },
  resultScore: { fontSize: 14, color: COLORS.textPrimary },
  resultMsg: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginTop: 4 },
  criticalBox: { flexDirection: "row", gap: 8, padding: 10, backgroundColor: "#FEE2E2", borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#FCA5A5", alignItems: "flex-start" },
  criticalTxt: { flex: 1, fontSize: 12, color: "#7F1D1D", lineHeight: 17, fontWeight: "700" },
  section: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8 },
  actionItem: { flexDirection: "row", gap: 10, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "flex-start" },
  actionDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionDotTxt: { color: "#fff", fontWeight: "800" },
  actionTxt: { flex: 1, fontSize: 13, color: COLORS.textPrimary, lineHeight: 19 },
  rdvBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.md, ...SHADOW, marginTop: 8 },
  rdvTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  finalBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  finalLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: "800", letterSpacing: 1 },
  finalScore: { fontSize: 14, fontWeight: "800", marginTop: 4 },
  followupBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#EDE9FE", borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#8B5CF6" },
  followupIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#8B5CF6" },
  followupTitle: { fontWeight: "800", color: "#5B21B6", fontSize: 14 },
  followupSub: { color: "#6B21A8", fontSize: 11, marginTop: 2, lineHeight: 15 },
  meta: { padding: 12, backgroundColor: "#F9FAFB", borderRadius: RADIUS.md, gap: 4, marginTop: 12 },
  metaTxt: { fontSize: 11, color: COLORS.textSecondary },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", marginTop: 12, lineHeight: 16 },
});
