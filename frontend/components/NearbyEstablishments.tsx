/**
 * NearbyEstablishments — Widget compact affichant 3-5 établissements proches
 * Utilisé après un dépistage TND positif ou une alerte post-partum.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
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
        <TouchableOpacity
          key={e.id}
          style={s.card}
          onPress={() => router.push({ pathname: "/etablissements/[id]", params: { id: e.id } } as any)}
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
  name: { fontWeight: "700", color: "#0F172A", fontSize: 13 },
  meta: { color: "#64748B", fontSize: 11, marginTop: 2 },
  specs: { color: "#EC4899", fontSize: 10, fontWeight: "700", marginTop: 2 },
  viewAll: { alignItems: "center", padding: 8, marginTop: 4 },
  viewAllTxt: { color: "#831843", fontSize: 12, fontWeight: "700" },
});
