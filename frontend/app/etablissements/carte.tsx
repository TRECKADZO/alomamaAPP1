/**
 * Carte interactive des établissements sanitaires privés autorisés.
 * - Utilise react-native-maps (natif) + web fallback via Leaflet (WebView)
 * - Regroupe les markers par région (cluster simple par zoom)
 * - Filtrage par spécialité
 */
import { useEffect, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import { api } from "../../lib/api";

// Import conditionnel : react-native-maps ne fonctionne pas sur web
const MapView: any = Platform.OS !== "web" ? require("react-native-map-clustering").default : null;
const Marker: any = Platform.OS !== "web" ? require("react-native-maps").Marker : null;
const PROVIDER_DEFAULT: any = Platform.OS !== "web" ? require("react-native-maps").PROVIDER_DEFAULT : null;

const CI_CENTER = { latitude: 7.5, longitude: -5.5, latitudeDelta: 6, longitudeDelta: 6 };

const SPECIALTIES = ["Maternité", "Pédiatrie", "Gynécologie", "Soins infirmiers", "Optique", "Psychiatrie"];

type Etab = {
  id: string; nom: string; categorie: string; region: string; commune?: string;
  adresse?: string; specialites_metier?: string[]; lat?: number; lon?: number;
};

export default function EtabMapScreen() {
  const [items, setItems] = useState<Etab[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [region, setRegion] = useState(CI_CENTER);
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Récupère uniquement les établissements GÉOCODÉS
        const r = await api.get("/etablissements?limit=500");
        const all = r.data?.items || [];
        // Filtrer ceux qui ont lat/lon
        const geo = all.filter((e: Etab) => e.lat && e.lon);
        setItems(geo);
        if (geo.length === 0) {
          Alert.alert(
            "Aucun établissement géocodé",
            "Lancez d'abord le géocodage batch depuis l'admin, ou géocodez individuellement depuis la fiche détail.",
          );
        }
      } catch (e: any) {
        Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de charger la carte.");
      } finally { setLoading(false); }
    })();

    // Position user
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          setUserLoc({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.5, longitudeDelta: 0.5 });
        }
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return items;
    return items.filter((e) => (e.specialites_metier || []).includes(filter));
  }, [items, filter]);

  const openDetail = (id: string) => router.push({ pathname: "/etablissements/[id]", params: { id } } as any);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  // Web fallback : liste géolocalisée avec liens Google Maps (car react-native-maps ne marche pas en web)
  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={s.container} edges={["bottom"]}>
        <View style={s.webBanner}>
          <Ionicons name="information-circle" size={18} color="#0369A1" />
          <Text style={s.webBannerTxt}>
            La carte interactive fonctionne sur mobile (iOS/Android). Sur web, utilisez la liste des établissements géocodés.
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
          {filtered.map((e) => (
            <TouchableOpacity key={e.id} style={s.webCard} onPress={() => openDetail(e.id)}>
              <View style={{ flex: 1 }}>
                <Text style={s.webName}>{e.nom}</Text>
                <Text style={s.webMeta}>📍 {e.commune || e.region}</Text>
                <Text style={s.webCoords}>GPS: {e.lat?.toFixed(4)}, {e.lon?.toFixed(4)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      {/* Filtres */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        <TouchableOpacity style={[s.chip, !filter && s.chipActive]} onPress={() => setFilter("")}>
          <Text style={[s.chipTxt, !filter && s.chipTxtActive]}>Tous ({items.length})</Text>
        </TouchableOpacity>
        {SPECIALTIES.map((sp) => (
          <TouchableOpacity key={sp} style={[s.chip, filter === sp && s.chipActive]} onPress={() => setFilter(sp)}>
            <Text style={[s.chipTxt, filter === sp && s.chipTxtActive]}>{sp}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Carte */}
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_DEFAULT}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation={!!userLoc}
        showsMyLocationButton
        clusterColor="#EC4899"
        clusterTextColor="#fff"
        radius={40}
      >
        {filtered.map((e) => (
          <Marker
            key={e.id}
            coordinate={{ latitude: e.lat!, longitude: e.lon! }}
            title={e.nom}
            description={`${e.categorie} · ${e.commune || e.region}`}
            pinColor={
              (e.specialites_metier || []).includes("Maternité") ? "#EC4899" :
              (e.specialites_metier || []).includes("Pédiatrie") ? "#7C3AED" :
              (e.specialites_metier || []).includes("Psychiatrie") ? "#DC2626" :
              "#0891B2"
            }
            onCalloutPress={() => openDetail(e.id)}
          />
        ))}
      </MapView>

      <View style={s.stats}>
        <Text style={s.statsTxt}>
          {filtered.length} établissement{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          {items.length !== filtered.length && ` (sur ${items.length} géocodés)`}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, backgroundColor: "#fff" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#F1F5F9", borderRadius: 999 },
  chipActive: { backgroundColor: "#EC4899" },
  chipTxt: { color: "#334155", fontSize: 12, fontWeight: "700" },
  chipTxtActive: { color: "#fff" },
  stats: { position: "absolute", bottom: 20, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  statsTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
  webBanner: { flexDirection: "row", gap: 8, backgroundColor: "#E0F2FE", padding: 12, margin: 14, borderRadius: 10, alignItems: "flex-start" },
  webBannerTxt: { flex: 1, color: "#0369A1", fontSize: 12, lineHeight: 16 },
  webCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 8 },
  webName: { fontWeight: "800", color: "#0F172A", fontSize: 13 },
  webMeta: { color: "#64748B", fontSize: 11, marginTop: 2 },
  webCoords: { color: "#94A3B8", fontSize: 10, fontFamily: "monospace", marginTop: 2 },
});
