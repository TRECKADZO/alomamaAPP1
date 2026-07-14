/**
 * CarteMap — Composant carte native (iOS/Android) avec clustering.
 * Version native uniquement — la version web est dans CarteMap.web.tsx
 */
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import MapView from "react-native-map-clustering";
import { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { api } from "../lib/api";

const CI_CENTER = { latitude: 7.5, longitude: -5.5, latitudeDelta: 6, longitudeDelta: 6 };
const SPECIALTIES = ["Maternité", "Pédiatrie", "Gynécologie", "Soins infirmiers", "Optique", "Psychiatrie"];

type Etab = {
  id: string; nom: string; categorie: string; region: string; commune?: string;
  adresse?: string; specialites_metier?: string[]; lat?: number; lon?: number;
};

export default function CarteMap() {
  const [items, setItems] = useState<Etab[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [region, setRegion] = useState(CI_CENTER);
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/etablissements", { params: { limit: 500 } });
        const geo = (r.data?.items || []).filter((e: Etab) => e.lat && e.lon);
        setItems(geo);
        if (geo.length === 0) {
          Alert.alert("Aucun établissement géocodé", "Lancez d'abord le géocodage depuis l'admin.");
        }
      } catch (e: any) {
        Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de charger la carte.");
      } finally { setLoading(false); }
    })();

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

  const filtered = useMemo(
    () => (!filter ? items : items.filter((e) => (e.specialites_metier || []).includes(filter))),
    [items, filter],
  );

  const openDetail = (id: string) => router.push({ pathname: "/etablissements/[id]", params: { id } } as any);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
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
});
