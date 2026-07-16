/**
 * Route /pharmacies-garde/carte — Carte interactive des pharmacies de garde.
 * Utilise LeafletMap + OpenStreetMap. Géolocalisation optionnelle + rayon.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import LeafletMap, { LeafletMapHandle, MapMarker } from "../../components/LeafletMap";
import ErrorBoundary from "../../components/ErrorBoundary";
import { api, formatError } from "../../lib/api";
import { openMapsDirections } from "../../components/NearbyEstablishments";
import { COLORS } from "../../constants/theme";

// Abidjan par défaut
const DEFAULT_CENTER = { lat: 5.3453, lon: -4.0072 };

function PharmaciesGardeCarteInner() {
  const router = useRouter();
  const mapRef = useRef<LeafletMapHandle>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [askingGeo, setAskingGeo] = useState(false);
  const [meta, setMeta] = useState<any>({});
  const [radiusKm, setRadiusKm] = useState<number>(500);

  const loadMarkers = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, listRes] = await Promise.all([
        api.get("/pharmacies/garde/current-week").catch(() => ({ data: {} })),
        userLoc && radiusKm < 500
          ? api.get("/pharmacies/garde/nearby", {
              params: { lat: userLoc.lat, lon: userLoc.lon, radius_km: radiusKm, limit: 500 },
            })
          : api.get("/pharmacies/garde", { params: { limit: 500 } }),
      ]);
      setMeta(metaRes.data || {});
      const items: any[] = listRes.data?.items || [];
      const asMarkers: MapMarker[] = items
        .filter((p) => p.lat && p.lon)
        .map((p) => ({
          id: p.id,
          lat: p.lat,
          lon: p.lon,
          nom: p.nom,
          categorie: "Pharmacie de garde",
          commune: p.commune,
          telephone: p.telephone_primary || undefined,
          adresse: p.commune,
          distance_km: p.distance_km,
          travel_min_car: p.travel_min_car,
        }));
      setMarkers(asMarkers);
      if (asMarkers.length > 0) {
        setTimeout(() => mapRef.current?.fitBounds(asMarkers), 500);
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setLoading(false); }
  }, [userLoc, radiusKm]);

  useFocusEffect(useCallback(() => { loadMarkers(); }, [loadMarkers]));

  const askForLocation = async () => {
    setAskingGeo(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission refusée",
          "La géolocalisation est nécessaire pour trouver les pharmacies proches. Vous pouvez l'activer plus tard dans les réglages du téléphone.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pos = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      setUserLoc(pos);
      mapRef.current?.centerOn(pos.lat, pos.lon, 13);
      if (radiusKm === 500) setRadiusKm(10);
    } catch (e) {
      Alert.alert("Erreur géolocalisation", formatError(e));
    } finally { setAskingGeo(false); }
  };

  const onMarkerPress = (m: MapMarker) => {
    router.push(`/pharmacies-garde/${m.id}` as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#16A34A", "#059669"]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🗺️ Carte pharmacies de garde</Text>
            <Text style={styles.headerSub}>
              {meta.periode || "Chargement…"} · {markers.length} points
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/pharmacies-garde" as any)} style={styles.iconBtn}>
            <Ionicons name="list" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#16A34A" />
            <Text style={styles.loadingTxt}>Chargement…</Text>
          </View>
        )}
      </View>

      {/* Bouton "Près de moi" */}
      <TouchableOpacity style={styles.locBtn} onPress={askForLocation} disabled={askingGeo} testID="locate-me-btn">
        {askingGeo ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="locate" size={16} color="#fff" />
            <Text style={styles.locBtnTxt}>{userLoc ? "Recentrer" : "Près de moi"}</Text>
          </>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

export default function PharmaciesGardeCarte() {
  return (
    <ErrorBoundary>
      <PharmaciesGardeCarteInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 2 },

  loadingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.6)", gap: 10,
  },
  loadingTxt: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },

  locBtn: {
    position: "absolute", right: 16, bottom: 24,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#16A34A",
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 999,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  locBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
