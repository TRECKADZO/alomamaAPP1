/**
 * Détail établissement — Adresse complète, spécialités, contact, ouverture Google Maps
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Linking, Platform, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { api } from "../../lib/api";
import { openMapsDirections } from "../../components/NearbyEstablishments";

type Etab = any;

export default function EtabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<Etab | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/etablissements/${id}`);
        setE(r.data);
      } catch { Alert.alert("Erreur", "Établissement introuvable"); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const geocode = async () => {
    setGeocoding(true);
    try {
      const r = await api.post(`/etablissements/${id}/geocode`);
      setE(r.data);
      Alert.alert("📍 Localisation trouvée", `Coordonnées: ${r.data.lat?.toFixed(4)}, ${r.data.lon?.toFixed(4)}`);
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail || "Géocodage impossible.");
    } finally { setGeocoding(false); }
  };

  const openInMaps = () => {
    if (!e) return;
    const query = e.lat && e.lon
      ? `${e.lat},${e.lon}`
      : encodeURIComponent(`${e.nom}, ${e.adresse || ""} ${e.commune || ""} Côte d'Ivoire`);
    const url = Platform.OS === "ios"
      ? `maps://?q=${query}`
      : `geo:0,0?q=${query}`;
    const fallback = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.canOpenURL(url).then((can) => {
      Linking.openURL(can ? url : fallback);
    }).catch(() => Linking.openURL(fallback));
  };

  const shareEtab = async () => {
    if (!e) return;
    await Share.share({
      message: `🏥 ${e.nom}\n📍 ${e.commune || e.region}\n📋 ${e.categorie}\n\n${e.adresse || ""}\n\nSource : Ministère Santé CI\nVia Alo Maman`,
    });
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;
  if (!e) return <SafeAreaView style={s.loader}><Text>Introuvable</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.name}>{e.nom}</Text>
          <View style={s.badges}>
            <View style={s.catBadge}><Text style={s.catBadgeTxt}>{e.categorie}</Text></View>
            {e.verified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
                <Text style={s.verifiedTxt}>Autorisé MSP CI</Text>
              </View>
            )}
          </View>
        </View>

        {/* Localisation */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>📍 Localisation</Text>
          {e.region && <View style={s.row}><Text style={s.rowLabel}>Région</Text><Text style={s.rowVal}>{e.region}</Text></View>}
          {e.district_sanitaire && <View style={s.row}><Text style={s.rowLabel}>District</Text><Text style={s.rowVal}>{e.district_sanitaire}</Text></View>}
          {e.commune && <View style={s.row}><Text style={s.rowLabel}>Commune</Text><Text style={s.rowVal}>{e.commune}</Text></View>}
          {e.adresse && (
            <View style={{ marginTop: 8 }}>
              <Text style={s.rowLabel}>Adresse</Text>
              <Text style={s.address}>{e.adresse}</Text>
            </View>
          )}
          {e.lat && e.lon ? (
            <View style={s.geoInfo}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={s.geoTxt}>Géolocalisé · {e.lat.toFixed(4)}, {e.lon.toFixed(4)}</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.geocodeBtn} onPress={geocode} disabled={geocoding}>
              {geocoding ? <ActivityIndicator color="#EC4899" size="small" /> : <Ionicons name="pin" size={14} color="#EC4899" />}
              <Text style={s.geocodeTxt}>Géolocaliser (Nominatim)</Text>
            </TouchableOpacity>
          )}
          <View style={s.mapBtnRow}>
            <TouchableOpacity style={[s.mapBtn, { flex: 1, backgroundColor: "#EC4899" }]} onPress={() => openMapsDirections(e)}>
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={s.mapBtnTxt}>Itinéraire</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.mapBtn, { flex: 1 }]} onPress={openInMaps}>
              <Ionicons name="map" size={16} color="#fff" />
              <Text style={s.mapBtnTxt}>Voir sur Maps</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Spécialités */}
        {(e.specialites_metier || []).length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>🩺 Spécialités disponibles</Text>
            <View style={s.chipsRow}>
              {e.specialites_metier.map((sp: string) => (
                <View key={sp} style={s.chip}><Text style={s.chipTxt}>{sp}</Text></View>
              ))}
            </View>
          </View>
        )}

        {/* Infos */}
        {(e.responsable || e.date_autorisation || e.source) && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>ℹ️ Informations</Text>
            {e.responsable && <View style={s.row}><Text style={s.rowLabel}>Responsable</Text><Text style={s.rowVal}>{e.responsable}</Text></View>}
            {e.date_autorisation && <View style={s.row}><Text style={s.rowLabel}>Autorisé le</Text><Text style={s.rowVal}>{e.date_autorisation}</Text></View>}
            {e.source && <View style={s.row}><Text style={s.rowLabel}>Source</Text><Text style={s.rowVal}>{e.source}</Text></View>}
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#EC4899" }]} onPress={() => router.push("/rdv-nouveau" as any)}>
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={s.actionTxt}>Prendre RDV via Alo Maman</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="etab-claim-btn" style={[s.actionBtn, { backgroundColor: "#7C3AED" }]} onPress={() => router.push({ pathname: "/etablissements/claim", params: { id: e.id } } as any)}>
          <Ionicons name="ribbon" size={18} color="#fff" />
          <Text style={s.actionTxt}>👨‍⚕️ Je suis pro dans cet établissement</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#0891B2" }]} onPress={shareEtab}>
          <Ionicons name="share-social" size={18} color="#fff" />
          <Text style={s.actionTxt}>Partager cet établissement</Text>
        </TouchableOpacity>

        <View style={s.disclaimer}>
          <Ionicons name="information-circle" size={16} color="#64748B" />
          <Text style={s.disclaimerTxt}>
            Cet établissement figure sur la liste officielle E-DEPPS du Ministère de la Santé de Côte d'Ivoire (mise à jour Juin 2026).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 14, paddingBottom: 60 },
  hero: { padding: 16, backgroundColor: "#fff", borderRadius: 12, marginBottom: 10 },
  name: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#FCE7F3", borderRadius: 4 },
  catBadgeTxt: { color: "#831843", fontSize: 11, fontWeight: "700" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#059669", borderRadius: 4 },
  verifiedTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: "800", fontSize: 14, color: "#0F172A", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4 },
  rowLabel: { color: "#64748B", fontSize: 12, flex: 1 },
  rowVal: { color: "#0F172A", fontSize: 13, fontWeight: "600", flex: 2, textAlign: "right" },
  address: { color: "#0F172A", fontSize: 13, marginTop: 4, lineHeight: 18 },
  geoInfo: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 8, backgroundColor: "#DCFCE7", borderRadius: 6 },
  geoTxt: { color: "#059669", fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  geocodeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, backgroundColor: "#FCE7F3", borderRadius: 8, marginTop: 10 },
  geocodeTxt: { color: "#EC4899", fontWeight: "800", fontSize: 12 },
  mapBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, backgroundColor: "#0F172A", borderRadius: 8, marginTop: 8 },
  mapBtnRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  mapBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#FCE7F3", borderRadius: 999 },
  chipTxt: { color: "#831843", fontSize: 12, fontWeight: "700" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginBottom: 8 },
  actionTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  disclaimer: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#E0F2FE", borderRadius: 10, alignItems: "flex-start", marginTop: 8 },
  disclaimerTxt: { flex: 1, color: "#0369A1", fontSize: 11, lineHeight: 15 },
});
