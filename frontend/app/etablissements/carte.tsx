/**
 * Route /etablissements/carte — délègue au composant CarteMap.
 * Wrappé dans un ErrorBoundary : si la carte native crashe, on affiche
 * gracefully un message + un bouton pour aller vers la liste plate.
 */
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import ErrorBoundary from "../../components/ErrorBoundary";
import CarteMap from "../../components/CarteMap";
import { api } from "../../lib/api";
import { openMapsDirections } from "../../components/NearbyEstablishments";

type Etab = {
  id: string; nom: string; categorie: string; region: string; commune?: string;
  adresse?: string; specialites_metier?: string[]; lat?: number; lon?: number;
};

function SafeFallback() {
  const [items, setItems] = React.useState<Etab[]>([]);
  const [loading, setLoading] = React.useState(true);

  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const r = await api.get("/etablissements", { params: { limit: 200 } });
          setItems((r.data?.items || []).filter((e: Etab) => e.lat && e.lon));
        } catch (e: any) {
          Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de charger la liste.");
        } finally { setLoading(false); }
      })();
    }, [])
  );

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <View style={s.info}>
        <Ionicons name="information-circle" size={20} color="#0369A1" />
        <View style={{ flex: 1 }}>
          <Text style={s.infoTitle}>Vue liste des établissements</Text>
          <Text style={s.infoTxt}>Boutons « Itinéraire » ouvrent Google Maps / Apple Maps.</Text>
        </View>
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

export default function CarteRoute() {
  return (
    <ErrorBoundary fallback={<SafeFallback />}>
      <CarteMap />
    </ErrorBoundary>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  info: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#E0F2FE" },
  infoTitle: { color: "#0369A1", fontSize: 12, fontWeight: "800" },
  infoTxt: { color: "#0369A1", fontSize: 11, marginTop: 2 },
  card: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 6 },
  name: { fontWeight: "800", color: "#0F172A", fontSize: 13 },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  mapBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#EC4899", borderRadius: 8 },
  mapBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
