/**
 * Route /pharmacies-garde/[id] — Fiche détaillée d'une pharmacie de garde.
 * Actions : Appeler, Itinéraire (Google Maps / Apple Plans), Copier adresse.
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type Pharmacie = {
  id: string;
  zone: string;
  commune: string;
  nom: string;
  responsable: string;
  telephone_primary: string | null;
  telephones: string[];
  contact_raw: string;
  lat: number;
  lon: number;
  source: string;
};

export default function PharmacieGardeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Pharmacie | null>(null);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [detail, metaRes] = await Promise.all([
          api.get(`/pharmacies/garde/${id}`),
          api.get("/pharmacies/garde/current-week").catch(() => ({ data: {} })),
        ]);
        setItem(detail.data);
        setMeta(metaRes.data || {});
      } catch (e: any) {
        Alert.alert("Erreur", "Impossible de charger la pharmacie", [
          { text: "Retour", onPress: () => router.back() },
        ]);
      } finally { setLoading(false); }
    })();
  }, [id, router]);

  const callPhone = (phone: string) => {
    const url = `tel:${phone}`;
    Linking.canOpenURL(url).then((ok) => ok && Linking.openURL(url));
  };

  const openDirections = () => {
    if (!item) return;
    const { lat, lon, nom } = item;
    const label = encodeURIComponent(nom);
    let url = "";
    if (Platform.OS === "ios") {
      url = `http://maps.apple.com/?q=${label}&ll=${lat},${lon}`;
    } else {
      // Android + web : Google Maps
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&destination_place_id=${label}`;
    }
    Linking.openURL(url);
  };

  const copyAddress = async () => {
    if (!item) return;
    await Clipboard.setStringAsync(`${item.nom} - ${item.commune}`);
    Alert.alert("✅ Copié", "L'adresse a été copiée dans le presse-papiers");
  };

  const shareLocation = async () => {
    if (!item) return;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`;
    const text = `📍 Pharmacie de garde : ${item.nom}\n${item.commune}\n${item.telephone_primary || ""}\n${mapsUrl}`;
    try {
      const { Share } = await import("react-native");
      await Share.share({ message: text });
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#16A34A" />
          <Text style={styles.loadingText}>Chargement de la pharmacie…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Pharmacie introuvable</Text>
          <TouchableOpacity style={styles.backBtnStatic} onPress={() => router.back()}>
            <Text style={styles.backTextStatic}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header vert */}
        <LinearGradient colors={["#16A34A", "#059669"]} style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerBadge}>PHARMACIE DE GARDE</Text>
              <Text style={styles.headerTitle} numberOfLines={2}>{item.nom}</Text>
            </View>
            <TouchableOpacity onPress={shareLocation} style={styles.iconBtn}>
              <Ionicons name="share-social-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Statut ouverte */}
          <View style={styles.openBadge}>
            <View style={styles.dot} />
            <Text style={styles.openText}>
              Ouverte 24h/24 · {meta.periode || "cette semaine"}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Actions rapides */}
          <View style={styles.actionsRow}>
            {item.telephone_primary && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionCall]}
                onPress={() => callPhone(item.telephone_primary!)}
                testID="action-call"
              >
                <Ionicons name="call" size={22} color="#fff" />
                <Text style={styles.actionText}>Appeler</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionMap]}
              onPress={openDirections}
              testID="action-directions"
            >
              <Ionicons name="navigate" size={22} color="#fff" />
              <Text style={styles.actionText}>Itinéraire</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionCopy]}
              onPress={copyAddress}
              testID="action-copy"
            >
              <Ionicons name="copy-outline" size={22} color="#fff" />
              <Text style={styles.actionText}>Copier</Text>
            </TouchableOpacity>
          </View>

          {/* Bloc coordonnées */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coordonnées</Text>

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="location" size={18} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Zone</Text>
                <Text style={styles.infoValue}>{item.commune}</Text>
                <Text style={styles.infoSub}>{item.zone === "abidjan" ? "🏙️ District d'Abidjan" : "🌍 Intérieur du pays"}</Text>
              </View>
            </View>

            {item.responsable ? (
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: "#DBEAFE" }]}>
                  <Ionicons name="person" size={18} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Responsable</Text>
                  <Text style={styles.infoValue}>{item.responsable}</Text>
                </View>
              </View>
            ) : null}

            {item.telephones && item.telephones.length > 0 ? (
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: "#FCE7F3" }]}>
                  <Ionicons name="call" size={18} color="#EC4899" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Téléphone{item.telephones.length > 1 ? "s" : ""}</Text>
                  {item.telephones.map((t) => (
                    <TouchableOpacity key={t} onPress={() => callPhone(t)}>
                      <Text style={styles.infoValuePhone}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* Bloc horaires */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Horaires de garde</Text>
            <View style={styles.hoursRow}>
              <Ionicons name="time-outline" size={18} color="#16A34A" />
              <Text style={styles.hoursText}>
                <Text style={{ fontWeight: "800" }}>24h/24 et 7j/7</Text> durant toute la période de garde
              </Text>
            </View>
            {meta.periode && (
              <Text style={styles.hoursSub}>
                Période en cours : {meta.periode}
              </Text>
            )}
          </View>

          {/* Bloc source / mise à jour */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Source</Text>
            <Text style={styles.sourceText}>
              Ces informations proviennent de l&apos;annuaire officiel des pharmacies de garde de Côte d&apos;Ivoire.
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(item.source || "https://www.pharmacies-de-garde.ci")}>
              <Text style={styles.sourceLink}>Voir la source →</Text>
            </TouchableOpacity>
            {meta.last_updated && (
              <Text style={styles.hoursSub}>
                Dernière mise à jour : {new Date(meta.last_updated).toLocaleDateString("fr-FR", {
                  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
                })}
              </Text>
            )}
          </View>

          {/* Voir sur la carte */}
          <TouchableOpacity
            style={styles.mapCta}
            onPress={() => router.push("/pharmacies-garde/carte" as any)}
          >
            <Ionicons name="map" size={20} color="#16A34A" />
            <Text style={styles.mapCtaText}>Voir sur la carte</Text>
            <Ionicons name="chevron-forward" size={16} color="#16A34A" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.textSecondary, fontSize: 13 },
  backBtnStatic: { marginTop: 16, padding: 12, borderRadius: 999, backgroundColor: "#16A34A" },
  backTextStatic: { color: "#fff", fontWeight: "800" },

  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerBadge: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 3, lineHeight: 26 },

  openBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    alignSelf: "flex-start",
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFF" },
  openText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  body: { paddingHorizontal: SPACING.lg, paddingTop: 16, gap: 12 },

  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: 14, borderRadius: RADIUS.lg, gap: 6,
    ...SHADOW.sm,
  },
  actionCall: { backgroundColor: "#16A34A" },
  actionMap: { backgroundColor: "#3B82F6" },
  actionCopy: { backgroundColor: "#8B5CF6" },
  actionText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, textTransform: "uppercase", letterSpacing: 0.5 },

  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary, marginTop: 2 },
  infoValuePhone: { fontSize: 15, fontWeight: "800", color: "#16A34A", marginTop: 2, textDecorationLine: "underline" },
  infoSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  hoursRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hoursText: { flex: 1, fontSize: 13, color: COLORS.textPrimary, lineHeight: 19 },
  hoursSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },

  sourceText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  sourceLink: { fontSize: 12, fontWeight: "800", color: "#16A34A", marginTop: 2 },

  mapCta: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#DCFCE7",
    padding: 14, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: "#16A34A",
    marginTop: 4,
  },
  mapCtaText: { flex: 1, color: "#166534", fontWeight: "800", fontSize: 13 },
});
