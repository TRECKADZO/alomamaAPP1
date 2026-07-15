/**
 * NearbyEstablishments — Widget compact affichant 3-5 établissements proches
 * Utilisé après un dépistage TND positif ou une alerte post-partum.
 * Inclut un bouton "Itinéraire" qui ouvre Google/Apple Maps natif.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../lib/api";

type Props = {
  context: "tnd" | "postpartum";
  level?: string;
  alertType?: string;
  commune?: string;
  limit?: number;
};

/**
 * Ouvre les itinéraires vers un établissement dans l'app Maps native.
 * - iOS : Apple Maps (fallback Google Maps si non dispo)
 * - Android : Google Maps navigation (fallback lien web)
 */
export async function openMapsDirections(e: {
  nom: string;
  lat?: number | null;
  lon?: number | null;
  adresse?: string;
  commune?: string;
  region?: string;
}) {
  const label = encodeURIComponent(e.nom || "Établissement");
  const hasCoords = typeof e.lat === "number" && typeof e.lon === "number";
  const query = hasCoords
    ? `${e.lat},${e.lon}`
    : encodeURIComponent([e.nom, e.adresse, e.commune, e.region, "Côte d'Ivoire"].filter(Boolean).join(", "));

  // Schémas natifs
  const iosNative = hasCoords
    ? `maps://?daddr=${e.lat},${e.lon}&q=${label}`
    : `maps://?q=${query}`;
  const androidNative = hasCoords
    ? `google.navigation:q=${e.lat},${e.lon}`
    : `geo:0,0?q=${query}`;
  const webFallback = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}&destination_place_id=${label}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;

  const primary = Platform.OS === "ios" ? iosNative : androidNative;
  // Sur web : sauter directement au webFallback (Linking.canOpenURL renvoie true à tort)
  if (Platform.OS === "web") {
    try {
      await Linking.openURL(webFallback);
    } catch {
      Alert.alert("Impossible d'ouvrir Maps", "Aucune application de cartographie n'est installée.");
    }
    return;
  }
  try {
    const supported = await Linking.canOpenURL(primary);
    if (supported) {
      await Linking.openURL(primary);
      return;
    }
    await Linking.openURL(webFallback);
  } catch {
    try {
      await Linking.openURL(webFallback);
    } catch {
      Alert.alert("Impossible d'ouvrir Maps", "Aucune application de cartographie n'est installée.");
    }
  }
}

export default function NearbyEstablishments({ context, level, alertType, commune, limit = 3 }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const endpoint = context === "tnd"
          ? `/etablissements/orient/tnd/${level || "medium_risk"}`
          : `/etablissements/orient/postpartum/${alertType || "medical"}`;
        const r = await api.get(endpoint, { params: { limit, commune } });
        setItems(r.data?.items || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [context, level, alertType, commune, limit]);

  if (loading) return <ActivityIndicator style={{ marginVertical: 20 }} color="#EC4899" />;
  if (items.length === 0) return null;

  const title = context === "tnd"
    ? "🏥 Établissements recommandés (pédiatrie)"
    : "🏥 Suivi médical proche de vous";

  return (
    <View style={s.container}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>Autorisés par le Ministère de la Santé CI</Text>
      {items.map((e: any) => (
        <View key={e.id} style={s.card}>
          <TouchableOpacity
            style={s.cardBody}
            onPress={() => router.push({ pathname: "/etablissements/[id]", params: { id: e.id } } as any)}
            accessibilityRole="button"
            accessibilityLabel={`Voir les détails de ${e.nom}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{e.nom}</Text>
              <Text style={s.meta}>
                📍 {e.commune || e.region} · {e.categorie}
              </Text>
              {(e.specialites_metier || []).length > 0 && (
                <Text style={s.specs}>{e.specialites_metier.slice(0, 3).join(" · ")}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.mapBtn}
            onPress={() => openMapsDirections(e)}
            accessibilityRole="button"
            accessibilityLabel={`Itinéraire vers ${e.nom}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text style={s.mapBtnTxt}>Itinéraire</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.viewAll} onPress={() => router.push("/etablissements" as any)}>
        <Text style={s.viewAllTxt}>Voir tous les établissements →</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 16, padding: 12, backgroundColor: "#FCE7F3", borderRadius: 12 },
  title: { fontWeight: "800", color: "#831843", fontSize: 14 },
  subtitle: { color: "#831843", fontSize: 11, marginTop: 2, marginBottom: 10, opacity: 0.7 },
  card: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", padding: 10, borderRadius: 8, marginBottom: 6 },
  cardBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  meta: { color: "#64748B", fontSize: 11, marginTop: 2 },
  specs: { color: "#EC4899", fontSize: 10, fontWeight: "700", marginTop: 2 },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EC4899",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 32,
  },
  mapBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
  viewAll: { alignItems: "center", padding: 8, marginTop: 4 },
  viewAllTxt: { color: "#831843", fontSize: 12, fontWeight: "700" },
});
