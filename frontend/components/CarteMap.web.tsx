/**
 * CarteMap.web.tsx — Fallback web (liste + Google Maps deep links)
 * react-native-maps ne fonctionne pas sur web.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../lib/api";
import { openMapsDirections } from "./NearbyEstablishments";

type Etab = {
  id: string; nom: string; categorie: string; region: string; commune?: string;
  adresse?: string; specialites_metier?: string[]; lat?: number; lon?: number;
};

export default function CarteMapWeb() {
  const [items, setItems] = useState<Etab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/etablissements", { params: { limit: 500 } });
        setItems((r.data?.items || []).filter((e: Etab) => e.lat && e.lon));
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <View style={s.header}>
        <Ionicons name="information-circle" size={16} color="#0369A1" />
        <Text style={s.headerTxt}>
          Carte native disponible sur mobile. Sur web, cliquez « Itinéraire » pour ouvrir Google Maps.
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {items.map((e) => (
          <View key={e.id} style={s.card}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: "/etablissements/[id]", params: { id: e.id } } as any)}
            >
              <Text style={s.name} numberOfLines={1}>{e.nom}</Text>
              <Text style={s.meta}>{e.commune || e.region} · {e.categorie}</Text>
              {e.lat && e.lon && (
                <Text style={s.coords}>{e.lat.toFixed(4)}, {e.lon.toFixed(4)}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.mapBtn} onPress={() => openMapsDirections(e)}>
              <Ionicons name="navigate" size={14} color="#fff" />
              <Text style={s.mapBtnTxt}>Itinéraire</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#E0F2FE" },
  headerTxt: { color: "#0369A1", fontSize: 12, flex: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 6 },
  name: { fontWeight: "800", color: "#0F172A", fontSize: 13 },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  coords: { color: "#94A3B8", fontSize: 10, fontFamily: "monospace", marginTop: 2 },
  mapBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#EC4899", borderRadius: 8 },
  mapBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
