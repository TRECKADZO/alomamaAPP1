/**
 * Suivi du développement TND — Liste des dépistages pour un enfant + accès au nouveau dpistage.
 */
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { api, formatError } from "../../../../lib/api";
import { cachedGet } from "../../../../lib/offline";
import { COLORS, RADIUS, SHADOW } from "../../../../constants/theme";

const LEVEL_LABEL: Record<string, { label: string; color: string; emoji: string }> = {
  faible: { label: "Risque faible", color: "#10B981", emoji: "🟢" },
  modere: { label: "Risque modéré", color: "#F59E0B", emoji: "🟠" },
  eleve: { label: "Risque élevé", color: "#DC2626", emoji: "🔴" },
};

export default function TndList() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await cachedGet(`/tnd/screenings/${id}`);
      setItems(r.data || []);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>🧠 Suivi du développement</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Mise en garde obligatoire */}
        <View style={styles.warningBox}>
          <Ionicons name="information-circle" size={22} color="#B45309" />
          <Text style={styles.warningTxt}>
            <Text style={{ fontWeight: "800" }}>Cet outil est un dépistage, il ne remplace pas un diagnostic médical.</Text>{"\n"}
            Les résultats vous guident vers une éventuelle consultation — ils ne posent aucun diagnostic.
          </Text>
        </View>

        <View style={styles.intro}>
          <Text style={styles.introTitle}>Dépistage M-CHAT-R™</Text>
          <Text style={styles.introTxt}>
            Questionnaire de dépistage des Troubles du Neurodéveloppement (TND), recommandé entre 16 et 30 mois. Dure environ 5 minutes.
          </Text>
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={() => router.push(`/enfants/${id}/tnd/nouveau` as any)} testID="tnd-start">
          <Ionicons name="clipboard" size={20} color="#fff" />
          <Text style={styles.startBtnTxt}>Commencer un nouveau dépistage</Text>
        </TouchableOpacity>

        <Text style={styles.histTitle}>Historique des dépistages ({items.length})</Text>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={42} color={COLORS.textMuted} />
            <Text style={styles.emptyTxt}>Aucun dépistage encore. Commencez par le bouton ci-dessus.</Text>
          </View>
        ) : items.map((it) => {
          const lvl = LEVEL_LABEL[it.level] || { label: it.level, color: "#6B7280", emoji: "⚪" };
          return (
            <TouchableOpacity key={it.id} style={styles.card} onPress={() => router.push(`/enfants/${id}/tnd/${it.id}` as any)}>
              <View style={[styles.cardLevel, { backgroundColor: lvl.color }]}>
                <Text style={styles.cardLevelTxt}>{lvl.emoji} {lvl.label}</Text>
              </View>
              <Text style={styles.cardScore}>Score : <Text style={{ fontWeight: "800" }}>{it.score}/20</Text></Text>
              <Text style={styles.cardDate}>{new Date(it.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  warningBox: { flexDirection: "row", gap: 10, padding: 12, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FCD34D", borderRadius: RADIUS.md, alignItems: "flex-start" },
  warningTxt: { flex: 1, fontSize: 12, color: "#78350F", lineHeight: 17 },
  intro: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, ...SHADOW, gap: 4 },
  introTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  introTxt: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, backgroundColor: "#8B5CF6", borderRadius: RADIUS.md, ...SHADOW },
  startBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  histTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginTop: 10 },
  empty: { alignItems: "center", padding: 20, gap: 8 },
  emptyTxt: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },
  card: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  cardLevel: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 6 },
  cardLevelTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  cardScore: { fontSize: 13, color: COLORS.textPrimary },
  cardDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
});
