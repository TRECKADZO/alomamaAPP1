/**
 * DMP — Détail enfant : 52 jalons / 7 domaines, scores, alertes, recherche.
 */
import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type Domain = { key: string; label: string; emoji: string; color: string; score: number | null; acquis: number; total_attendus: number; total_milestones: number; alertes: number };
type Item = { id: string; domaine: string; titre: string; description: string; age_typique: number; age_alerte: number; emoji: string; statut: "acquis" | "en_cours" | "alerte" | "trop_jeune"; acquis: boolean; acquired_at?: string };

export default function DmpEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [activeDomain, setActiveDomain] = useState<string>("all"); // "all" ou clé domaine
  const [activeTab, setActiveTab] = useState<"all" | "alerte" | "acquis">("all");

  const load = async () => {
    try {
      const r = await api.get(`/enfants/${id}/dmp`);
      setData(r.data);
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible de charger le bilan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [id]));

  const toggleAcquis = async (item: Item) => {
    try {
      if (item.acquis) {
        await api.delete(`/enfants/${id}/dmp/${item.id}`);
      } else {
        await api.post(`/enfants/${id}/dmp/${item.id}`);
      }
      load();
    } catch (e: any) {
      Alert.alert("Erreur", "Modification impossible");
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!data) return null;

  const items: Item[] = data.items || [];
  const domains: Domain[] = data.domains || [];
  const alertes: Item[] = data.alertes || [];

  // Filtres
  const filtered = items.filter((it) => {
    if (activeDomain !== "all" && it.domaine !== activeDomain) return false;
    if (activeTab === "alerte" && it.statut !== "alerte") return false;
    if (activeTab === "acquis" && !it.acquis) return false;
    if (q.trim()) {
      const ql = q.toLowerCase();
      if (!it.titre.toLowerCase().includes(ql) && !it.description.toLowerCase().includes(ql)) return false;
    }
    return true;
  });

  const ageMois = data.age_mois;
  const enfant = data.enfant;
  const scoreGlobal = data.score_global;

  const ageLabel = (() => {
    if (ageMois < 12) return `${ageMois} mois`;
    const y = Math.floor(ageMois / 12);
    const m = ageMois - y * 12;
    return m ? `${y} an${y > 1 ? "s" : ""} ${m} mois` : `${y} an${y > 1 ? "s" : ""}`;
  })();

  const scoreColor = scoreGlobal === null ? "#9CA3AF" : scoreGlobal >= 80 ? "#10B981" : scoreGlobal >= 60 ? "#F59E0B" : "#EF4444";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#0EA5E9"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{enfant.nom} • {ageLabel}</Text>
          <Text style={styles.sub}>Bilan développemental — DMP</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor }]}>
          <Text style={styles.scoreBadgeText}>{scoreGlobal === null ? "--" : `${scoreGlobal}%`}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Bandeau alertes */}
        {alertes.length > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>⚠️ {alertes.length} jalon{alertes.length > 1 ? "s" : ""} en retard</Text>
              <Text style={styles.alertSub}>Consultez votre pédiatre pour évaluer</Text>
            </View>
            <TouchableOpacity onPress={() => setActiveTab("alerte")} style={styles.alertCta}>
              <Text style={styles.alertCtaText}>Voir</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scores par domaine */}
        <Text style={styles.sectionTitle}>Scores par domaine</Text>
        <View style={styles.domainGrid}>
          {domains.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.domainCard, activeDomain === d.key && { borderColor: d.color, borderWidth: 2 }]}
              onPress={() => setActiveDomain(activeDomain === d.key ? "all" : d.key)}
            >
              <View style={styles.domainHead}>
                <Text style={styles.domainEmoji}>{d.emoji}</Text>
                {d.alertes > 0 && (
                  <View style={styles.alertDot}>
                    <Text style={styles.alertDotText}>{d.alertes}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.domainLabel}>{d.label}</Text>
              <Text style={[styles.domainScore, { color: d.score === null ? "#9CA3AF" : d.color }]}>
                {d.score === null ? "—" : `${d.score}%`}
              </Text>
              {/* Progress bar */}
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${d.score || 0}%`, backgroundColor: d.color }]} />
              </View>
              <Text style={styles.domainSub}>
                {d.acquis}/{d.total_attendus} attendus
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recherche */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Rechercher un jalon..."
            placeholderTextColor={COLORS.textMuted}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs filtres */}
        <View style={styles.tabsRow}>
          <Tab label="Tous" active={activeTab === "all"} count={items.length} onPress={() => setActiveTab("all")} />
          <Tab label="🔴 Alertes" active={activeTab === "alerte"} count={alertes.length} color="#EF4444" onPress={() => setActiveTab("alerte")} />
          <Tab label="✅ Acquis" active={activeTab === "acquis"} count={items.filter((it) => it.acquis).length} color="#10B981" onPress={() => setActiveTab("acquis")} />
        </View>

        {/* Liste jalons */}
        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>Aucun jalon ne correspond aux filtres.</Text>
        ) : (
          filtered.map((it) => {
            const domain = domains.find((d) => d.key === it.domaine);
            const colorByStatut = it.statut === "alerte" ? "#EF4444" : it.statut === "acquis" ? "#10B981" : it.statut === "en_cours" ? "#F59E0B" : "#9CA3AF";
            return (
              <TouchableOpacity
                key={it.id}
                style={[
                  styles.itemCard,
                  it.statut === "alerte" && { borderColor: "#FCA5A5", borderWidth: 1.5, backgroundColor: "#FEF2F2" },
                  it.acquis && { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
                ]}
                onPress={() => toggleAcquis(it)}
                testID={`item-${it.id}`}
              >
                <View style={styles.itemLeft}>
                  <Text style={{ fontSize: 24 }}>{it.emoji}</Text>
                  <View style={[styles.itemDomainPill, { backgroundColor: `${domain?.color || "#9CA3AF"}22` }]}>
                    <Text style={[styles.itemDomainPillText, { color: domain?.color || "#9CA3AF" }]}>
                      {domain?.emoji}
                    </Text>
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{it.titre}</Text>
                  <Text style={styles.itemDesc} numberOfLines={2}>{it.description}</Text>
                  <View style={styles.itemMeta}>
                    <View style={[styles.itemStatut, { backgroundColor: `${colorByStatut}22` }]}>
                      <View style={[styles.itemDot, { backgroundColor: colorByStatut }]} />
                      <Text style={[styles.itemStatutText, { color: colorByStatut }]}>
                        {it.statut === "alerte" ? "Retard" : it.statut === "acquis" ? "Acquis" : it.statut === "en_cours" ? "En cours" : "À venir"}
                      </Text>
                    </View>
                    <Text style={styles.itemAge}>≈ {it.age_typique} mois (alerte si {it.age_alerte}+)</Text>
                  </View>
                </View>

                <View style={[styles.checkBox, it.acquis && { backgroundColor: "#10B981", borderColor: "#10B981" }]}>
                  {it.acquis && <Ionicons name="checkmark" size={18} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.disclaimerText}>
            Outil indicatif basé sur les standards OMS et CDC. En cas de doute,
            consultez toujours votre pédiatre — chaque enfant évolue à son rythme.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tab({ label, active, count, color, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tab, active && { backgroundColor: color || COLORS.primary, borderColor: color || COLORS.primary }]}
    >
      <Text style={[styles.tabText, active && { color: "#fff" }]}>{label}</Text>
      <View style={[styles.tabCount, active && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
        <Text style={[styles.tabCountText, active && { color: "#fff" }]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  scoreBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minWidth: 56, alignItems: "center" },
  scoreBadgeText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  alertBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: RADIUS.lg, backgroundColor: "#EF4444", marginBottom: 14, ...SHADOW },
  alertTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  alertSub: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 2 },
  alertCta: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#fff", borderRadius: 999 },
  alertCtaText: { color: "#EF4444", fontWeight: "800", fontSize: 12 },

  sectionTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textSecondary, marginTop: 8, marginBottom: 10, textTransform: "uppercase" },

  domainGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  domainCard: { width: "31%", padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  domainHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  domainEmoji: { fontSize: 22 },
  alertDot: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  alertDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  domainLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary, lineHeight: 14 },
  domainScore: { fontSize: 18, fontWeight: "900", marginTop: 4 },
  progressBg: { height: 4, backgroundColor: "#F3F4F6", borderRadius: 2, marginTop: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  domainSub: { fontSize: 9, color: COLORS.textMuted, marginTop: 4 },

  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 13, padding: 0 },

  tabsRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  tabCount: { backgroundColor: COLORS.bgSecondary, borderRadius: 8, paddingHorizontal: 5, minWidth: 18, alignItems: "center" },
  tabCountText: { fontSize: 10, fontWeight: "800", color: COLORS.textPrimary },

  itemCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  itemLeft: { alignItems: "center", gap: 4 },
  itemDomainPill: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  itemDomainPillText: { fontSize: 10 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  itemDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 14 },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  itemStatut: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  itemDot: { width: 6, height: 6, borderRadius: 3 },
  itemStatutText: { fontSize: 10, fontWeight: "700" },
  itemAge: { fontSize: 9, color: COLORS.textMuted },

  checkBox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },

  emptyText: { textAlign: "center", color: COLORS.textMuted, padding: 30, fontStyle: "italic" },

  disclaimer: { flexDirection: "row", gap: 6, marginTop: 16, padding: 10, backgroundColor: "#F9FAFB", borderRadius: RADIUS.md },
  disclaimerText: { flex: 1, fontSize: 11, color: COLORS.textMuted, lineHeight: 15 },
});
