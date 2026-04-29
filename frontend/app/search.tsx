import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, FlatList, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Prestation = { id: string; nom: string; prix_fcfa: number; duree_min?: number; cmu_prise_en_charge?: boolean };

export default function Search() {
  const router = useRouter();
  const [tab, setTab] = useState<"pros" | "community">("pros");
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [prestation, setPrestation] = useState("");
  const [maxPrix, setMaxPrix] = useState("");
  const [cmuOnly, setCmuOnly] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedPro, setExpandedPro] = useState<string | null>(null);
  const [proDispos, setProDispos] = useState<Record<string, any[]>>({});
  const [loadingDispos, setLoadingDispos] = useState<string | null>(null);

  const loadDispos = async (proId: string) => {
    if (proDispos[proId]) return;
    setLoadingDispos(proId);
    try {
      const r = await api.get(`/professionnels/${proId}/disponibilites`);
      const slots = (r.data?.slots || []).filter((s: any) => s.actif);
      setProDispos((p) => ({ ...p, [proId]: slots }));
    } catch {
      setProDispos((p) => ({ ...p, [proId]: [] }));
    } finally { setLoadingDispos(null); }
  };

  const toggleExpand = (proId: string) => {
    if (expandedPro === proId) {
      setExpandedPro(null);
    } else {
      setExpandedPro(proId);
      loadDispos(proId);
    }
  };

  const QUICK_PRESTATIONS = [
    { label: "Échographie", value: "échographie" },
    { label: "Consultation", value: "consultation" },
    { label: "Accouchement", value: "accouchement" },
    { label: "Suivi prénatal", value: "prénatal" },
    { label: "Vaccination", value: "vaccin" },
    { label: "Pédiatrie", value: "pédiatre" },
  ];

  const run = async () => {
    setLoading(true);
    try {
      let url: string;
      if (tab === "pros") {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (spec) params.set("specialite", spec);
        if (prestation) params.set("prestation", prestation);
        if (maxPrix && parseInt(maxPrix) > 0) params.set("max_prix", maxPrix);
        if (cmuOnly) params.set("cmu_only", "true");
        url = `/search/pros?${params.toString()}`;
      } else {
        url = `/search/community?q=${encodeURIComponent(q)}`;
      }
      const { data } = await api.get(url);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Chargement auto initial + à chaque changement de filtre/tab (debounce 300ms)
  useEffect(() => {
    const t = setTimeout(() => { run(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, spec, prestation, maxPrix, cmuOnly]);

  // Pour la recherche libre (q), on attend que l'utilisateur clique pour ne pas spammer
  useEffect(() => {
    if (!q) {
      // Si l'utilisateur efface q, on relance pour réafficher tous les pros
      const t = setTimeout(() => { run(); }, 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const fmtPrix = (n: number) => n.toLocaleString("fr-FR") + " F";

  const activeFilters = (prestation ? 1 : 0) + (maxPrix ? 1 : 0) + (cmuOnly ? 1 : 0) + (spec ? 1 : 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Recherche</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "pros" && styles.tabActive]} onPress={() => { setTab("pros"); setResults([]); }}>
          <Text style={[styles.tabText, tab === "pros" && styles.tabTextActive]}>🩺 Professionnels</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "community" && styles.tabActive]} onPress={() => { setTab("community"); setResults([]); }}>
          <Text style={[styles.tabText, tab === "community" && styles.tabTextActive]}>💬 Communauté</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            placeholder={tab === "pros" ? "Nom du pro..." : "Mot-clé..."}
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={run}
            returnKeyType="search"
            testID="search-input"
          />
        </View>

        {tab === "pros" && (
          <>
            {/* Quick chips for prestations */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {QUICK_PRESTATIONS.map((qp) => {
                const active = prestation.toLowerCase() === qp.value.toLowerCase();
                return (
                  <TouchableOpacity
                    key={qp.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => { setPrestation(active ? "" : qp.value); }}
                    testID={`chip-${qp.value}`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{qp.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Toggle filters */}
            <TouchableOpacity style={styles.filterToggle} onPress={() => setShowFilters((s) => !s)} testID="toggle-filters">
              <Ionicons name="options-outline" size={16} color={COLORS.primary} />
              <Text style={styles.filterToggleText}>Filtres avancés{activeFilters > 0 ? ` (${activeFilters})` : ""}</Text>
              <Ionicons name={showFilters ? "chevron-up" : "chevron-down"} size={16} color={COLORS.primary} />
            </TouchableOpacity>

            {showFilters && (
              <View style={styles.advBox}>
                <View style={styles.inputWrap}>
                  <Ionicons name="briefcase" size={18} color={COLORS.textMuted} />
                  <TextInput style={styles.input} value={spec} onChangeText={setSpec} placeholder="Spécialité (ex: Pédiatre)" placeholderTextColor={COLORS.textMuted} testID="spec-input" />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="medkit-outline" size={18} color={COLORS.textMuted} />
                  <TextInput style={styles.input} value={prestation} onChangeText={setPrestation} placeholder="Type de prestation (ex: échographie)" placeholderTextColor={COLORS.textMuted} testID="prestation-input" />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="cash-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={maxPrix}
                    onChangeText={(t) => setMaxPrix(t.replace(/[^0-9]/g, ""))}
                    placeholder="Prix max FCFA (ex: 20000)"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    testID="maxprix-input"
                  />
                </View>
                <TouchableOpacity style={[styles.cmuToggle, cmuOnly && styles.cmuToggleActive]} onPress={() => setCmuOnly((s) => !s)} testID="cmu-toggle">
                  <Ionicons name={cmuOnly ? "checkbox" : "square-outline"} size={20} color={cmuOnly ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[styles.cmuToggleText, cmuOnly && { color: "#15803D", fontWeight: "800" }]}>Seulement les pros qui acceptent la CMU</Text>
                </TouchableOpacity>
                {(prestation || maxPrix || cmuOnly || spec) && (
                  <TouchableOpacity onPress={() => { setPrestation(""); setMaxPrix(""); setCmuOnly(false); setSpec(""); }} style={styles.clearBtn} testID="clear-filters">
                    <Ionicons name="close-circle" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.clearBtnText}>Effacer les filtres</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}

        <TouchableOpacity style={styles.btnSearch} onPress={run} testID="run-search-btn">
          <Text style={styles.btnSearchText}>Rechercher</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0 }}
          renderItem={({ item }) => tab === "pros" ? (
            <View style={styles.resCard}>
              <View style={styles.proHead}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.name?.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.resName}>{item.name}</Text>
                    {item.accepte_cmu ? (
                      <View style={styles.cmuBadge}><Text style={styles.cmuBadgeText}>CMU</Text></View>
                    ) : null}
                  </View>
                  <Text style={styles.resMeta}>{item.specialite}</Text>
                  {item.ville ? <Text style={styles.resMetaSm}>📍 {item.ville}</Text> : null}
                </View>
              </View>
              {(item.prestations_match || []).length > 0 && (
                <View style={styles.prestList}>
                  {(item.prestations_match as Prestation[]).slice(0, 3).map((p) => (
                    <View key={p.id} style={styles.prestRow}>
                      <Ionicons name="medkit" size={12} color={COLORS.primary} />
                      <Text style={styles.prestName} numberOfLines={1}>{p.nom}</Text>
                      <Text style={styles.prestPrix}>{fmtPrix(p.prix_fcfa)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Bouton voir disponibilités */}
              <TouchableOpacity
                style={styles.dispoToggle}
                onPress={() => toggleExpand(item.id)}
                testID={`expand-dispos-${item.id}`}
              >
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                <Text style={styles.dispoToggleText}>
                  {expandedPro === item.id ? "Masquer les disponibilités" : "Voir les disponibilités"}
                </Text>
                <Ionicons name={expandedPro === item.id ? "chevron-up" : "chevron-down"} size={16} color={COLORS.primary} />
              </TouchableOpacity>

              {/* Disponibilités du pro (lazy) */}
              {expandedPro === item.id && (
                <View style={styles.disposBox}>
                  {loadingDispos === item.id ? (
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  ) : (proDispos[item.id] || []).length === 0 ? (
                    <Text style={styles.dispoEmpty}>Aucun créneau renseigné par ce pro</Text>
                  ) : (
                    Object.entries(
                      (proDispos[item.id] || []).reduce((acc: Record<string, any[]>, s: any) => {
                        if (!acc[s.jour]) acc[s.jour] = [];
                        acc[s.jour].push(s);
                        return acc;
                      }, {})
                    ).map(([jour, slots]: [string, any[]]) => (
                      <View key={jour} style={styles.dispoJour}>
                        <Text style={styles.dispoJourLabel}>{jour.charAt(0).toUpperCase() + jour.slice(1)}</Text>
                        {slots.map((s, i) => (
                          <View key={i} style={styles.dispoSlot}>
                            <View style={styles.dispoTime}>
                              <Text style={styles.dispoTimeText}>{s.heure_debut}-{s.heure_fin}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.dispoType}>{s.type_label || "Consultation"}</Text>
                              <Text style={styles.dispoMeta}>⏱ {s.duree_minutes} min{s.prix_fcfa ? ` · 💰 ${s.prix_fcfa.toLocaleString()} F` : ""}</Text>
                            </View>
                            {s.cmu_prise_en_charge && <Text style={styles.dispoCmu}>🏥</Text>}
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              )}
              <View style={styles.proActions}>
                <TouchableOpacity
                  style={styles.actionChat}
                  onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(item.name)}`)}
                  testID={`chat-${item.id}`}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.actionChatText}>Discuter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionRdv}
                  onPress={() => router.push({ pathname: "/(tabs)/rdv", params: { pro_id: item.id } })}
                  testID={`book-rdv-${item.id}`}
                >
                  <Ionicons name="calendar" size={16} color="#fff" />
                  <Text style={styles.actionRdvText}>Prendre RDV</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.resCard}>
              <View style={[styles.avatar, { backgroundColor: COLORS.secondary }]}><Text style={styles.avatarText}>{item.user_name?.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resName}>{item.title}</Text>
                <Text style={styles.resMeta} numberOfLines={2}>{item.content}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{loading ? "" : "Aucun résultat — lancez une recherche"}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: SPACING.xl, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  searchBox: { paddingHorizontal: SPACING.xl, gap: 8, marginBottom: 14 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  filterToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  filterToggleText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  advBox: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, gap: 8, borderWidth: 1, borderColor: COLORS.border },
  cmuToggle: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: RADIUS.sm },
  cmuToggleActive: { backgroundColor: "#DCFCE7" },
  cmuToggleText: { color: COLORS.textPrimary, fontSize: 13, flex: 1 },
  clearBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6 },
  clearBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  btnSearch: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.pill, alignItems: "center" },
  btnSearchText: { color: "#fff", fontWeight: "700" },
  resCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  proHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  resName: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  resMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  resMetaSm: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  cmuBadge: { backgroundColor: "#DCFCE7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  cmuBadgeText: { color: "#15803D", fontWeight: "800", fontSize: 10 },
  prestList: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 4 },
  prestRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  prestName: { flex: 1, color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
  prestPrix: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },

  proActions: { flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionChat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionChatText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  actionRdv: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
  },
  actionRdvText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 30, fontStyle: "italic" },
});
