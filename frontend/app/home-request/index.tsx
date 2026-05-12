/**
 * Maman — Mes demandes à domicile / urgence (avec offres reçues).
 */
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";

export default function HomeRequestList() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/home-request/mine");
      setItems(r.data || []);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); setRefresh(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Mes demandes domicile</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} />}>
        <View style={styles.cta}>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: "#F59E0B" }]} onPress={() => router.push("/home-request/new?type=domicile")}>
            <Ionicons name="home" size={20} color="#fff" />
            <Text style={styles.ctaTxt}>🏠 Soins à domicile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: "#DC2626" }]} onPress={() => router.push("/home-request/new?type=urgence")}>
            <Ionicons name="medkit" size={20} color="#fff" />
            <Text style={styles.ctaTxt}>🆘 Urgence sans-RDV</Text>
          </TouchableOpacity>
        </View>
        {items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTxt}>Aucune demande pour le moment.</Text>
            <Text style={styles.emptySub}>Vos demandes apparaîtront ici avec les offres reçues des professionnels.</Text>
          </View>
        )}
        {items.map((it) => {
          const isUrgence = it.type === "urgence";
          const color = isUrgence ? "#DC2626" : "#F59E0B";
          const statusLabel = {
            open: "En attente d'offres",
            proposed: `${(it.proposals || []).length} offre(s) reçue(s)`,
            accepted: "Offre acceptée",
            paid: "Payé",
            completed: "Terminé",
            cancelled: "Annulé",
            expired: "Expiré",
          }[it.status] || it.status;
          return (
            <TouchableOpacity key={it.id} style={styles.card} onPress={() => router.push(`/home-request/${it.id}`)}>
              <View style={[styles.cardBadge, { backgroundColor: color }]}>
                <Text style={styles.cardBadgeTxt}>{isUrgence ? "🆘 URGENCE" : "🏠 DOMICILE"}</Text>
              </View>
              <Text style={styles.cardMotif}>{it.motif}</Text>
              <Text style={styles.cardMeta}>{isUrgence ? `${(it.mode === "domicile" ? "À domicile" : it.mode === "teleconsultation" ? "Téléconsultation" : "Au cabinet")} · ` : `Zone ${it.zone} · `}{it.ville || "CI"} · {new Date(it.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              <View style={styles.statusRow}>
                <Text style={[styles.statusTxt, { color }]}>{statusLabel}</Text>
                {(it.proposals || []).length > 0 && it.status !== "cancelled" && it.status !== "expired" && (
                  <View style={styles.dot}><Text style={styles.dotTxt}>{(it.proposals || []).length}</Text></View>
                )}
              </View>
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
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 12 },
  cta: { flexDirection: "row", gap: 8, marginBottom: 8 },
  ctaBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: RADIUS.md, gap: 6 },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  emptySub: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },
  card: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, ...SHADOW, marginBottom: 8 },
  cardBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 6 },
  cardBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
  cardMotif: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  cardMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  statusTxt: { fontSize: 12, fontWeight: "800" },
  dot: { backgroundColor: "#DC2626", borderRadius: 999, width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  dotTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
