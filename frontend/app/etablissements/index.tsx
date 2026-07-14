/**
 * Écran principal — Annuaire des établissements sanitaires privés (E-DEPPS MSP CI)
 * Liste + Recherche + Filtres (région, catégorie, spécialité) + Distance si géoloc
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { api } from "../../lib/api";

type Etab = {
  id: string;
  nom: string;
  categorie: string;
  region: string;
  district_sanitaire?: string;
  commune?: string;
  adresse?: string;
  responsable?: string;
  date_autorisation?: string;
  specialites_metier?: string[];
  lat?: number;
  lon?: number;
  source?: string;
  verified?: boolean;
};

type Meta = {
  total: number;
  regions: string[];
  categories: string[];
  specialites_metier: Record<string, string[]>;
};

const SPECIALTIES_ICONS: Record<string, string> = {
  "Maternité": "🌸",
  "Pédiatrie": "👶",
  "Gynécologie": "🌺",
  "Soins infirmiers": "🩺",
  "Optique": "👀",
  "Psychiatrie": "🧠",
  "Imagerie": "📸",
  "Laboratoire": "🔬",
  "Pharmacie": "💊",
  "Kinésithérapie": "🤸",
  "Dentaire": "🦷",
  "Nutrition": "🥗",
};

export default function EtablissementsScreen() {
  const [items, setItems] = useState<Etab[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string>("");
  const [specialite, setSpecialite] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [total, setTotal] = useState(0);

  const load = async () => {
    try {
      const params: any = { limit: 200 };
      if (q) params.q = q;
      if (region) params.region = region;
      if (specialite) params.specialite = specialite;
      const [r, m] = await Promise.all([
        api.get("/etablissements", { params }),
        meta ? Promise.resolve({ data: meta }) : api.get("/etablissements/meta"),
      ]);
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
      if (!meta) setMeta(m.data);
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible de charger l'annuaire.");
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  // Reload sur changement de filtres
  useEffect(() => {
    if (!loading) { setLoading(true); load(); }
    // eslint-disable-next-line
  }, [region, specialite]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Autorisation refusée", "L'accès à votre position permettrait de trier par distance.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setUserLoc({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    } catch {
      Alert.alert("Erreur", "Impossible d'obtenir votre position.");
    }
  };

  // Distance (km) entre 2 points géo (formule haversine simplifiée)
  const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371;
    const toRad = (x: number) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  };

  const sortedItems = useMemo(() => {
    if (!userLoc) return items;
    return [...items].sort((a, b) => {
      if (!a.lat || !b.lat) return 0;
      return km(userLoc, { lat: a.lat, lon: a.lon! }) - km(userLoc, { lat: b.lat, lon: b.lon! });
    });
  }, [items, userLoc]);

  if (loading && items.length === 0) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  const clearFilters = () => { setQ(""); setRegion(""); setSpecialite(""); };
  const hasFilters = q || region || specialite;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      {/* Barre recherche */}
      <View style={s.searchBar}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un établissement, une ville…"
          placeholderTextColor="#94A3B8"
          style={s.searchInp}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.push("/etablissements/carte" as any)} style={s.mapIconBtn}>
          <Ionicons name="map" size={18} color="#EC4899" />
        </TouchableOpacity>
      </View>

      {/* Filtres actions */}
      <View style={s.filterRow}>
        <TouchableOpacity style={s.filterBtn} onPress={() => setShowFilters(!showFilters)}>
          <Ionicons name={showFilters ? "chevron-up" : "options"} size={16} color="#EC4899" />
          <Text style={s.filterTxt}>Filtres{hasFilters ? " •" : ""}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.filterBtn} onPress={requestLocation}>
          <Ionicons name={userLoc ? "navigate" : "navigate-outline"} size={16} color={userLoc ? "#059669" : "#94A3B8"} />
          <Text style={[s.filterTxt, userLoc && { color: "#059669" }]}>{userLoc ? "Position OK" : "Trier par distance"}</Text>
        </TouchableOpacity>
        {hasFilters && (
          <TouchableOpacity style={[s.filterBtn, { backgroundColor: "#FEE2E2" }]} onPress={clearFilters}>
            <Ionicons name="close" size={16} color="#DC2626" />
            <Text style={[s.filterTxt, { color: "#DC2626" }]}>Effacer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Panneau filtres */}
      {showFilters && meta && (
        <View style={s.filtersPanel}>
          <Text style={s.filterLabel}>Spécialité</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {Object.keys(meta.specialites_metier).map((sp) => (
              <TouchableOpacity
                key={sp}
                onPress={() => setSpecialite(sp === specialite ? "" : sp)}
                style={[s.chip, specialite === sp && s.chipActive]}
              >
                <Text style={[s.chipTxt, specialite === sp && s.chipTxtActive]}>
                  {SPECIALTIES_ICONS[sp] || "•"} {sp}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[s.filterLabel, { marginTop: 8 }]}>Région</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {meta.regions.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRegion(r === region ? "" : r)}
                style={[s.chip, region === r && s.chipActive]}
              >
                <Text style={[s.chipTxt, region === r && s.chipTxtActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Résultats */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🏥 Annuaire officiel</Text>
        <Text style={s.headerCount}>{sortedItems.length}/{total} · Source MSP CI</Text>
      </View>

      <ScrollView
        style={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {sortedItems.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🔍</Text>
            <Text style={s.emptyTxt}>Aucun établissement trouvé</Text>
            <Text style={s.emptySub}>Essayez d'autres filtres ou une recherche différente.</Text>
          </View>
        ) : sortedItems.map((e) => {
          const distance = userLoc && e.lat && e.lon ? km(userLoc, { lat: e.lat, lon: e.lon }) : null;
          return (
            <TouchableOpacity
              key={e.id}
              style={s.card}
              onPress={() => router.push({ pathname: "/etablissements/[id]", params: { id: e.id } } as any)}
            >
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName} numberOfLines={2}>{e.nom}</Text>
                  <Text style={s.cardCat}>{e.categorie}</Text>
                </View>
                {e.verified && (
                  <View style={s.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={11} color="#059669" />
                    <Text style={s.verifiedTxt}>MSP</Text>
                  </View>
                )}
              </View>

              {(e.commune || e.region) && (
                <View style={s.metaRow}>
                  <Ionicons name="location" size={12} color="#64748B" />
                  <Text style={s.metaTxt} numberOfLines={1}>
                    {[e.commune, e.region].filter(Boolean).join(" · ")}
                  </Text>
                  {distance !== null && (
                    <Text style={s.distance}>· {distance} km</Text>
                  )}
                </View>
              )}

              {(e.specialites_metier || []).length > 0 && (
                <View style={s.specsRow}>
                  {e.specialites_metier!.slice(0, 3).map((sp) => (
                    <View key={sp} style={s.specChip}>
                      <Text style={s.specChipTxt}>{SPECIALTIES_ICONS[sp] || "•"} {sp}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", marginHorizontal: 14, marginTop: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: "#E5E7EB" },
  searchInp: { flex: 1, color: "#0F172A", fontSize: 14 },
  mapIconBtn: { paddingHorizontal: 6 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 6 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: "#E5E7EB" },
  filterTxt: { color: "#0F172A", fontSize: 12, fontWeight: "700" },
  filtersPanel: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#F1F5F9" },
  filterLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: "#E5E7EB" },
  chipActive: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  chipTxt: { color: "#334155", fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  headerCount: { fontSize: 11, color: "#64748B" },
  scroll: { flex: 1, paddingHorizontal: 14 },
  empty: { padding: 40, alignItems: "center" },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: "#64748B", fontSize: 14, fontWeight: "700" },
  emptySub: { color: "#94A3B8", fontSize: 12, marginTop: 4, textAlign: "center" },
  card: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 8 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  cardName: { fontWeight: "800", color: "#0F172A", fontSize: 14 },
  cardCat: { color: "#64748B", fontSize: 11, marginTop: 2 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#DCFCE7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  verifiedTxt: { color: "#059669", fontSize: 9, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  metaTxt: { color: "#64748B", fontSize: 11, flex: 1 },
  distance: { color: "#EC4899", fontSize: 11, fontWeight: "800" },
  specsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  specChip: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "#FCE7F3", borderRadius: 4 },
  specChipTxt: { color: "#831843", fontSize: 10, fontWeight: "700" },
});
