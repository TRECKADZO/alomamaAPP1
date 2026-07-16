/**
 * Console Admin — Gestion des Pharmacies de Garde.
 * - Statistiques de la période courante
 * - Bouton "Rafraîchir maintenant" (déclenche le scraper)
 * - Historique des scrapes (audit)
 */
import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type MetaCurrent = {
  periode?: string;
  periode_debut?: string;
  periode_fin?: string;
  last_updated?: string;
  source?: string;
  total?: number;
  total_abidjan?: number;
  total_interieur?: number;
  communes_abidjan?: string[];
  villes_interieur?: string[];
};

type HistoryEntry = {
  scraped_at: string;
  periode?: string;
  total: number;
  count_abidjan: number;
  count_interieur: number;
  previous_count: number;
  added_count: number;
  removed_count: number;
  source: string;
};

export default function AdminPharmaciesGarde() {
  const router = useRouter();
  const [meta, setMeta] = useState<MetaCurrent>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scraping, setScraping] = useState(false);

  const load = useCallback(async () => {
    try {
      const [metaRes, histRes] = await Promise.all([
        api.get("/pharmacies/garde/current-week").catch(() => ({ data: {} })),
        api.get("/admin/pharmacies/garde/history").catch(() => ({ data: { items: [] } })),
      ]);
      setMeta(metaRes.data || {});
      setHistory(histRes.data?.items || []);
    } catch (e) {
      // silence
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runRefresh = async () => {
    if (scraping) return;
    Alert.alert(
      "Rafraîchir la liste ?",
      "Le scraper va télécharger la dernière version depuis pharmacies-de-garde.ci. Cela peut prendre 5-10 secondes.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Lancer",
          onPress: async () => {
            setScraping(true);
            try {
              const r = await api.post("/pharmacies/garde/refresh");
              const d = r.data || {};
              Alert.alert(
                "✅ Liste mise à jour",
                `${d.total} pharmacies (${d.count_abidjan} Abidjan + ${d.count_interieur} Intérieur)\n` +
                  `Période : ${d.periode || "—"}\n` +
                  `➕ ${d.added || 0} ajoutées · ➖ ${d.removed || 0} retirées`,
                [{ text: "OK", onPress: load }],
              );
            } catch (e) {
              Alert.alert("Erreur", formatError(e));
            } finally { setScraping(false); }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#16A34A", "#059669"]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>💊 Pharmacies de garde</Text>
            <Text style={styles.headerSub}>Console d&apos;administration</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={["#16A34A"]}
          />
        }
      >
        {loading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color="#16A34A" />
          </View>
        ) : (
          <>
            {/* Stats en cours */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 Période en cours</Text>
              <Text style={styles.periode}>{meta.periode || "Aucune donnée"}</Text>

              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{meta.total || 0}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: "#DBEAFE" }]}>
                  <Text style={[styles.statValue, { color: "#3B82F6" }]}>{meta.total_abidjan || 0}</Text>
                  <Text style={styles.statLabel}>Abidjan</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: "#FCE7F3" }]}>
                  <Text style={[styles.statValue, { color: "#EC4899" }]}>{meta.total_interieur || 0}</Text>
                  <Text style={styles.statLabel}>Intérieur</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="business-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>
                  {(meta.communes_abidjan?.length || 0)} communes · {(meta.villes_interieur?.length || 0)} villes intérieur
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>
                  Dernière mise à jour : {meta.last_updated
                    ? new Date(meta.last_updated).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
                    : "—"}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="link-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText} numberOfLines={1}>{meta.source || "—"}</Text>
              </View>
            </View>

            {/* Bouton refresh */}
            <TouchableOpacity
              style={[styles.refreshBtn, scraping && { opacity: 0.5 }]}
              onPress={runRefresh}
              disabled={scraping}
              testID="admin-refresh-pharmacies"
            >
              {scraping ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh" size={22} color="#fff" />
                  <Text style={styles.refreshText}>Rafraîchir maintenant</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.refreshHint}>
              Automatique tous les Lundis à 06:00 UTC. Utilisez ce bouton en cas de changement d&apos;horaires urgents.
            </Text>

            {/* Historique */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📜 Historique des scrapes</Text>
              {history.length === 0 ? (
                <Text style={styles.emptyHist}>Aucun scrape enregistré pour le moment.</Text>
              ) : (
                history.map((h, i) => (
                  <View key={i} style={styles.histRow}>
                    <View style={styles.histBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histDate}>
                        {new Date(h.scraped_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </Text>
                      <Text style={styles.histPeriode}>{h.periode || "—"}</Text>
                      <View style={styles.histMeta}>
                        <Text style={styles.histMetaText}>
                          {h.total} pharmacies ({h.count_abidjan} + {h.count_interieur})
                        </Text>
                        {h.added_count > 0 && (
                          <View style={[styles.diffChip, { backgroundColor: "#DCFCE7" }]}>
                            <Text style={[styles.diffText, { color: "#166534" }]}>+{h.added_count}</Text>
                          </View>
                        )}
                        {h.removed_count > 0 && (
                          <View style={[styles.diffChip, { backgroundColor: "#FEE2E2" }]}>
                            <Text style={[styles.diffText, { color: "#991B1B" }]}>-{h.removed_count}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Communes couvertes */}
            {meta.communes_abidjan && meta.communes_abidjan.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🏙️ Communes d&apos;Abidjan couvertes ({meta.communes_abidjan.length})</Text>
                <View style={styles.chipGrid}>
                  {meta.communes_abidjan.map((c) => (
                    <View key={c} style={styles.communeChip}>
                      <Text style={styles.communeChipText} numberOfLines={1}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    ...SHADOW.sm,
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 12 },
  periode: { fontSize: 15, fontWeight: "800", color: "#16A34A", marginBottom: 12 },

  statsGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: RADIUS.md,
    padding: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 24, fontWeight: "900", color: COLORS.textPrimary },
  statLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textSecondary, marginTop: 2, textTransform: "uppercase" },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  metaText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },

  refreshBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#16A34A",
    paddingVertical: 14, borderRadius: RADIUS.lg,
    marginBottom: 6,
    ...SHADOW.sm,
  },
  refreshText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  refreshHint: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginBottom: 14, fontStyle: "italic" },

  emptyWrap: { alignItems: "center", padding: 40, gap: 10 },
  emptyHist: { fontSize: 12, color: COLORS.textSecondary, fontStyle: "italic" },

  histRow: { flexDirection: "row", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  histBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#16A34A",
    alignItems: "center", justifyContent: "center",
    marginTop: 2,
  },
  histDate: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  histPeriode: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  histMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  histMetaText: { fontSize: 11, color: COLORS.textSecondary },
  diffChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  diffText: { fontSize: 10, fontWeight: "800" },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  communeChip: {
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 180,
  },
  communeChipText: { fontSize: 11, fontWeight: "700", color: "#166534" },
});
