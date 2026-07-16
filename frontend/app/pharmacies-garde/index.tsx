/**
 * Route /pharmacies-garde — Liste des pharmacies de garde de la semaine.
 * Filtres : zone (Abidjan / Intérieur), commune, recherche libre.
 * Source : https://www.pharmacies-de-garde.ci (scrapé hebdomadairement).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  TextInput, FlatList, Linking, RefreshControl, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { cachedGet } from "../../lib/offline";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type Pharmacie = {
  id: string;
  zone: "abidjan" | "interieur";
  commune: string;
  nom: string;
  responsable: string;
  telephone_primary: string | null;
  telephones: string[];
  lat: number;
  lon: number;
};

export default function PharmaciesGardeIndex() {
  const router = useRouter();
  const [zone, setZone] = useState<"abidjan" | "interieur">("abidjan");
  const [q, setQ] = useState("");
  const [commune, setCommune] = useState<string>("");
  const [items, setItems] = useState<Pharmacie[]>([]);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [communes, setCommunes] = useState<string[]>([]);

  const load = useCallback(async (fromCache = false) => {
    try {
      const [metaRes, listRes] = await Promise.all([
        (fromCache ? cachedGet("/pharmacies/garde/current-week") : api.get("/pharmacies/garde/current-week")).catch(() => ({ data: {} })),
        (fromCache ? cachedGet(`/pharmacies/garde?zone=${zone}&limit=500`) : api.get(`/pharmacies/garde?zone=${zone}&limit=500`)).catch(() => ({ data: { items: [] } })),
      ]);
      setMeta(metaRes.data || {});
      setItems(listRes.data?.items || []);
      const c = zone === "abidjan" ? (metaRes.data?.communes_abidjan || []) : (metaRes.data?.villes_interieur || []);
      setCommunes(c);
    } catch (e) {
      // silencieux — offline / erreur
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [zone]);

  useEffect(() => { setLoading(true); load(); }, [zone, load]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    const cn = commune.trim().toLowerCase();
    return items.filter((p) => {
      const matchQ = !qn || p.nom.toLowerCase().includes(qn) || p.commune.toLowerCase().includes(qn) || (p.responsable || "").toLowerCase().includes(qn);
      const matchC = !cn || p.commune.toLowerCase().includes(cn);
      return matchQ && matchC;
    });
  }, [items, q, commune]);

  const callPharmacy = (phone: string | null) => {
    if (!phone) return;
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((ok) => ok && Linking.openURL(url));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header vert avec gradient */}
      <LinearGradient colors={["#16A34A", "#059669"]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn" style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>💊 Pharmacies de garde</Text>
            <Text style={styles.headerSub}>
              {meta.periode || "Chargement…"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/pharmacies-garde/historique" as any)} testID="history-btn" style={styles.iconBtn}>
            <Ionicons name="time" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/pharmacies-garde/carte" as any)} testID="map-btn" style={styles.iconBtn}>
            <Ionicons name="map" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Onglets Abidjan / Intérieur */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, zone === "abidjan" && styles.tabActive]}
            onPress={() => { setZone("abidjan"); setCommune(""); }}
            testID="tab-abidjan"
          >
            <Text style={[styles.tabText, zone === "abidjan" && styles.tabTextActive]}>
              🏙️ Abidjan ({meta.total_abidjan || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, zone === "interieur" && styles.tabActive]}
            onPress={() => { setZone("interieur"); setCommune(""); }}
            testID="tab-interieur"
          >
            <Text style={[styles.tabText, zone === "interieur" && styles.tabTextActive]}>
              🌍 Intérieur ({meta.total_interieur || 0})
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Recherche */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher une pharmacie…"
          placeholderTextColor={COLORS.textMuted}
          testID="search-input"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres communes (chips horizontaux) */}
      {communes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.communeChipsRow}
        >
          <TouchableOpacity
            style={[styles.chip, !commune && styles.chipActive]}
            onPress={() => setCommune("")}
          >
            <Text style={[styles.chipText, !commune && styles.chipTextActive]}>Toutes ({items.length})</Text>
          </TouchableOpacity>
          {communes.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, commune === c && styles.chipActive]}
              onPress={() => setCommune(commune === c ? "" : c)}
              testID={`chip-commune-${c}`}
            >
              <Text style={[styles.chipText, commune === c && styles.chipTextActive]} numberOfLines={1}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Bandeau info "ouverte 24h/24 durant la période" */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={16} color="#16A34A" />
        <Text style={styles.infoBannerText} numberOfLines={2}>
          Ces pharmacies sont ouvertes <Text style={{ fontWeight: "800" }}>24h/24</Text> durant toute la semaine de garde.
        </Text>
      </View>

      {/* Liste */}
      {loading ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color="#16A34A" />
          <Text style={styles.emptyText}>Chargement…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="medkit-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Aucune pharmacie trouvée</Text>
          <Text style={styles.emptyText}>Essayez de changer de zone ou de commune.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              colors={["#16A34A"]}
              tintColor="#16A34A"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/pharmacies-garde/${item.id}` as any)}
              testID={`pharm-card-${item.id}`}
            >
              <View style={styles.cardIconWrap}>
                <Ionicons name="medkit" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={2}>{item.nom}</Text>
                <View style={styles.cardMetaRow}>
                  <Ionicons name="location-outline" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.cardCommune} numberOfLines={1}>{item.commune}</Text>
                </View>
                {item.responsable ? (
                  <Text style={styles.cardResp} numberOfLines={1}>{item.responsable}</Text>
                ) : null}
                <View style={styles.cardBadges}>
                  <View style={styles.badgeOpen}>
                    <View style={styles.dot} />
                    <Text style={styles.badgeOpenText}>Ouverte 24h/24</Text>
                  </View>
                </View>
              </View>
              {item.telephone_primary && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); callPharmacy(item.telephone_primary); }}
                  style={styles.callBtn}
                  hitSlop={10}
                  testID={`call-btn-${item.id}`}
                >
                  <Ionicons name="call" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ListFooterComponent={() => (
            <View style={styles.footerNote}>
              <Text style={styles.footerText}>
                Source : pharmacies-de-garde.ci · Mis à jour {meta.last_updated ? new Date(meta.last_updated).toLocaleDateString("fr-FR") : "—"}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  tabsRow: { flexDirection: "row", gap: 8, backgroundColor: "rgba(255,255,255,0.15)", padding: 4, borderRadius: 999 },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 999 },
  tabActive: { backgroundColor: "#fff" },
  tabText: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 12 },
  tabTextActive: { color: "#16A34A" },

  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 999,
    paddingHorizontal: 14, height: 44,
    marginHorizontal: SPACING.lg, marginTop: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },

  communeChipsRow: { gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    maxWidth: 220,
  },
  chipActive: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },
  chipTextActive: { color: "#fff" },

  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#DCFCE7", borderRadius: RADIUS.md,
    padding: 10,
    marginHorizontal: SPACING.lg, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: "#16A34A",
  },
  infoBannerText: { flex: 1, fontSize: 12, color: "#166534", lineHeight: 17 },

  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    marginBottom: 10, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  cardIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#DCFCE7",
    alignItems: "center", justifyContent: "center",
  },
  cardName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  cardCommune: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600", flex: 1 },
  cardResp: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  cardBadges: { flexDirection: "row", gap: 6, marginTop: 6 },
  badgeOpen: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16A34A" },
  badgeOpenText: { fontSize: 10, fontWeight: "800", color: "#166534" },

  callBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#16A34A",
    alignItems: "center", justifyContent: "center",
  },

  emptyWrap: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  emptyText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },

  footerNote: { paddingVertical: 16, alignItems: "center" },
  footerText: { fontSize: 10, color: COLORS.textMuted, fontStyle: "italic" },
});
