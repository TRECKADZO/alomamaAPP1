/**
 * Route /etablissements/carte — Carte interactive Leaflet + OSM cross-platform.
 * Fonctionnalités : géolocalisation, filtres (spécialité, CMU, distance, texte),
 * 1500+ marqueurs clusterisés, popups riches, boutons RDV/Itinéraire.
 * Zéro dépendance à Google Maps API.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
  TextInput, Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import * as Location from "expo-location";
import LeafletMap, { LeafletMapHandle, MapMarker } from "../../components/LeafletMap";
import ErrorBoundary from "../../components/ErrorBoundary";
import { api, formatError } from "../../lib/api";
import { openMapsDirections } from "../../components/NearbyEstablishments";

const SPECIALTIES = ["Maternité", "Pédiatrie", "Gynécologie", "Sage-femme", "Dentaire", "Ophtalmologie", "Psychiatrie", "Pharmacie", "Kinésithérapie", "Radiologie / Imagerie", "Laboratoire"];
const RADIUS_OPTIONS: { label: string; value: number }[] = [
  { label: "1 km", value: 1 },
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "20 km", value: 20 },
  { label: "50 km", value: 50 },
  { label: "Tout", value: 500 },
];

// Abidjan par défaut
const DEFAULT_CENTER = { lat: 5.3453, lon: -4.0072 };

function CarteScreenInner() {
  const mapRef = useRef<LeafletMapHandle>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [askingGeo, setAskingGeo] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  // Filtres
  const [specialite, setSpecialite] = useState<string>("");
  const [cmuOnly, setCmuOnly] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(500);
  const [textSearch, setTextSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(
    () => (specialite ? 1 : 0) + (cmuOnly ? 1 : 0) + (radiusKm < 500 ? 1 : 0) + (textSearch ? 1 : 0),
    [specialite, cmuOnly, radiusKm, textSearch],
  );

  const loadMarkers = useCallback(async () => {
    setLoading(true);
    try {
      let items: MapMarker[] = [];
      if (userLoc && radiusKm < 500) {
        // Nearby avec position
        const r = await api.get("/etablissements/nearby", {
          params: {
            lat: userLoc.lat,
            lon: userLoc.lon,
            radius_km: radiusKm,
            specialite: specialite || undefined,
            cmu: cmuOnly ? true : undefined,
            q: textSearch || undefined,
            limit: 2000,
          },
        });
        items = r.data?.items || [];
      } else {
        // Sans position ou "Tout" : list globale avec filtres — récupère TOUS les établissements
        const r = await api.get("/etablissements", {
          params: {
            specialite: specialite || undefined,
            q: textSearch || undefined,
            limit: 2000,
          },
        });
        items = (r.data?.items || []).filter((e: any) => e.lat && e.lon);
        if (cmuOnly) items = items.filter((e: any) => e.cmu_accepted === true);
      }
      setMarkers(items);
      // Fit bounds sur les résultats
      if (items.length > 0) {
        setTimeout(() => mapRef.current?.fitBounds(items), 500);
      }
    } catch (e) {
      Alert.alert("Erreur chargement", formatError(e));
    } finally { setLoading(false); }
  }, [userLoc, radiusKm, specialite, cmuOnly, textSearch]);

  useFocusEffect(useCallback(() => { loadMarkers(); }, [loadMarkers]));

  const askForLocation = async () => {
    // Consentement d'abord
    setShowConsent(true);
  };

  const grantLocation = async () => {
    setShowConsent(false);
    setAskingGeo(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission refusée",
          "La géolocalisation est nécessaire pour trouver les établissements proches. Vous pouvez l'activer plus tard dans les réglages.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pos = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      setUserLoc(pos);
      mapRef.current?.centerOn(pos.lat, pos.lon, 14);
      if (radiusKm === 500) setRadiusKm(10);  // basculer sur nearby par défaut
    } catch (e) {
      Alert.alert("Erreur géolocalisation", formatError(e));
    } finally { setAskingGeo(false); }
  };

  const clearFilters = () => {
    setSpecialite("");
    setCmuOnly(false);
    setRadiusKm(500);
    setTextSearch("");
  };

  const onMarkerPress = (m: MapMarker) => {
    router.push({ pathname: "/etablissements/[id]", params: { id: m.id } } as any);
  };

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      {/* Header actions */}
      <View style={s.header}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color="#94A3B8" />
          <TextInput
            style={s.searchInput}
            placeholder="Rechercher un établissement, un quartier…"
            placeholderTextColor="#94A3B8"
            value={textSearch}
            onChangeText={setTextSearch}
            onSubmitEditing={loadMarkers}
            returnKeyType="search"
          />
          {textSearch !== "" && (
            <TouchableOpacity onPress={() => { setTextSearch(""); loadMarkers(); }}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.iconBtn} onPress={() => setShowFilters(true)}>
          <Ionicons name="options" size={18} color="#7C3AED" />
          {activeFilterCount > 0 && (
            <View style={s.badge}><Text style={s.badgeTxt}>{activeFilterCount}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {/* Chips filtres actifs */}
      {(specialite || cmuOnly || radiusKm < 500) && (
        <View style={{ maxHeight: 44 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.activeFilters}>
          {specialite && (
            <TouchableOpacity style={s.chipActive} onPress={() => setSpecialite("")}>
              <Text style={s.chipActiveTxt}>{specialite} ×</Text>
            </TouchableOpacity>
          )}
          {cmuOnly && (
            <TouchableOpacity style={s.chipActive} onPress={() => setCmuOnly(false)}>
              <Text style={s.chipActiveTxt}>CMU ✓ ×</Text>
            </TouchableOpacity>
          )}
          {radiusKm < 500 && userLoc && (
            <TouchableOpacity style={s.chipActive} onPress={() => setRadiusKm(500)}>
              <Text style={s.chipActiveTxt}>Rayon {radiusKm} km ×</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.chipActive, { backgroundColor: "#F1F5F9" }]} onPress={clearFilters}>
            <Text style={[s.chipActiveTxt, { color: "#64748B" }]}>Tout effacer</Text>
          </TouchableOpacity>
        </ScrollView>
        </View>
      )}

      {/* Map */}
      <View style={{ flex: 1 }}>
        <LeafletMap
          ref={mapRef}
          initialCenter={userLoc || DEFAULT_CENTER}
          initialZoom={userLoc ? 13 : 7}
          markers={markers}
          userLocation={userLoc}
          onMarkerPress={onMarkerPress}
          onDirectionsPress={(m) => openMapsDirections(m as any)}
        />
        {loading && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator color="#EC4899" />
            <Text style={s.loadingTxt}>Chargement…</Text>
          </View>
        )}
      </View>

      {/* Bouton "Près de moi" */}
      <TouchableOpacity style={s.locBtn} onPress={askForLocation} disabled={askingGeo}>
        {askingGeo ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="locate" size={16} color="#fff" />
            <Text style={s.locBtnTxt}>{userLoc ? "Recentrer" : "Établissements près de moi"}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Compteur */}
      <View style={s.counter}>
        <Text style={s.counterTxt}>
          {markers.length} établissement{markers.length > 1 ? "s" : ""}
          {userLoc && radiusKm < 500 ? ` · rayon ${radiusKm} km` : ""}
        </Text>
      </View>

      {/* Modal Filtres */}
      <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Filtres avancés</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              <Text style={s.filterLabel}>Spécialité</Text>
              <View style={s.chipGrid}>
                <TouchableOpacity
                  style={[s.chipFilter, !specialite && s.chipFilterActive]}
                  onPress={() => setSpecialite("")}
                >
                  <Text style={[s.chipFilterTxt, !specialite && s.chipFilterTxtActive]}>Toutes</Text>
                </TouchableOpacity>
                {SPECIALTIES.map((sp) => (
                  <TouchableOpacity
                    key={sp}
                    style={[s.chipFilter, specialite === sp && s.chipFilterActive]}
                    onPress={() => setSpecialite(specialite === sp ? "" : sp)}
                  >
                    <Text style={[s.chipFilterTxt, specialite === sp && s.chipFilterTxtActive]}>{sp}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.filterLabel}>Assurance</Text>
              <TouchableOpacity
                style={[s.rowToggle, cmuOnly && s.rowToggleActive]}
                onPress={() => setCmuOnly(!cmuOnly)}
              >
                <Ionicons name={cmuOnly ? "checkbox" : "square-outline"} size={22} color={cmuOnly ? "#059669" : "#94A3B8"} />
                <Text style={s.rowToggleTxt}>Uniquement les établissements CMU acceptés</Text>
              </TouchableOpacity>

              <Text style={s.filterLabel}>
                Rayon {userLoc ? "" : "(nécessite votre position)"}
              </Text>
              <View style={s.chipGrid}>
                {RADIUS_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[s.chipFilter, radiusKm === r.value && s.chipFilterActive, !userLoc && r.value < 500 && { opacity: 0.4 }]}
                    disabled={!userLoc && r.value < 500}
                    onPress={() => setRadiusKm(r.value)}
                  >
                    <Text style={[s.chipFilterTxt, radiusKm === r.value && s.chipFilterTxtActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!userLoc && (
                <TouchableOpacity style={s.geoLocRow} onPress={() => { setShowFilters(false); askForLocation(); }}>
                  <Ionicons name="locate" size={16} color="#EC4899" />
                  <Text style={s.geoLocTxt}>Activer la géolocalisation</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.actionBtn, s.actionBtnSecondary]} onPress={clearFilters}>
                <Text style={s.actionBtnTxtSecondary}>Réinitialiser</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={() => { setShowFilters(false); loadMarkers(); }}>
                <Text style={s.actionBtnTxt}>Appliquer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Consentement Géoloc */}
      <Modal visible={showConsent} animationType="fade" transparent onRequestClose={() => setShowConsent(false)}>
        <View style={s.modalOverlay}>
          <View style={s.consentBox}>
            <Ionicons name="location" size={40} color="#EC4899" />
            <Text style={s.consentTitle}>Autoriser la géolocalisation ?</Text>
            <Text style={s.consentTxt}>
              À lo Maman utilise votre position pour vous montrer les établissements de santé proches.
              {"\n\n"}Votre position N&apos;EST PAS stockée sur nos serveurs. Elle reste uniquement sur votre téléphone.
              {"\n\n"}Conformité RGSSI N3 · Vous pouvez révoquer à tout moment dans les réglages.
            </Text>
            <View style={s.consentActions}>
              <TouchableOpacity style={s.consentBtnDeny} onPress={() => setShowConsent(false)}>
                <Text style={s.consentBtnDenyTxt}>Refuser</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.consentBtnAllow} onPress={grantLocation}>
                <Text style={s.consentBtnAllowTxt}>Autoriser</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Wrapper avec ErrorBoundary pour capturer les crashs
export default function CarteRoute() {
  return (
    <ErrorBoundary>
      <CarteScreenInner />
    </ErrorBoundary>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: "#fff", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 10 : 6 },
  searchInput: { flex: 1, color: "#0F172A", fontSize: 13 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", position: "relative" },
  badge: { position: "absolute", top: -4, right: -4, backgroundColor: "#EC4899", borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeTxt: { color: "#fff", fontSize: 9, fontWeight: "800" },
  activeFilters: { paddingHorizontal: 10, paddingVertical: 6, gap: 6, alignItems: "center", backgroundColor: "#fff", maxHeight: 44 },
  chipActive: { backgroundColor: "#EDE9FE", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipActiveTxt: { color: "#5B21B6", fontWeight: "700", fontSize: 11 },
  loadingOverlay: { position: "absolute", top: 10, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.95)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  loadingTxt: { color: "#EC4899", fontWeight: "700", fontSize: 12 },
  locBtn: { position: "absolute", bottom: 20, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EC4899", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },
  locBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  counter: { position: "absolute", bottom: 20, left: 12, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  counterTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontWeight: "800", fontSize: 17, color: "#0F172A" },
  filterLabel: { fontWeight: "700", color: "#334155", marginTop: 12, marginBottom: 6, fontSize: 13 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chipFilter: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#F1F5F9", borderRadius: 999 },
  chipFilterActive: { backgroundColor: "#EC4899" },
  chipFilterTxt: { color: "#334155", fontWeight: "700", fontSize: 12 },
  chipFilterTxtActive: { color: "#fff" },
  rowToggle: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#F1F5F9", borderRadius: 10 },
  rowToggleActive: { backgroundColor: "#DCFCE7" },
  rowToggleTxt: { color: "#0F172A", fontSize: 13, fontWeight: "600", flex: 1 },
  geoLocRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginTop: 8 },
  geoLocTxt: { color: "#EC4899", fontWeight: "700", fontSize: 12 },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 20 },
  actionBtn: { flex: 1, padding: 14, backgroundColor: "#EC4899", borderRadius: 12, alignItems: "center" },
  actionBtnSecondary: { backgroundColor: "#F1F5F9" },
  actionBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionBtnTxtSecondary: { color: "#334155", fontWeight: "700", fontSize: 13 },
  consentBox: { backgroundColor: "#fff", margin: 24, padding: 24, borderRadius: 20, alignItems: "center" },
  consentTitle: { fontWeight: "800", fontSize: 17, color: "#0F172A", marginTop: 12, textAlign: "center" },
  consentTxt: { color: "#64748B", fontSize: 12, marginTop: 8, lineHeight: 18, textAlign: "center" },
  consentActions: { flexDirection: "row", gap: 8, marginTop: 20, width: "100%" },
  consentBtnDeny: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center" },
  consentBtnDenyTxt: { color: "#64748B", fontWeight: "700", fontSize: 13 },
  consentBtnAllow: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: "#EC4899", alignItems: "center" },
  consentBtnAllowTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
