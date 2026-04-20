import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const TYPE_LABELS: Record<string, string> = {
  clinique_privee: "Clinique privée",
  hopital_public: "Hôpital public",
  pmi: "PMI",
  maternite: "Maternité",
};

export default function Centres() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (q) params.q = q;
      if (region) params.region = region;
      const { data } = await api.get("/centres", { params });
      setList(data);
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Centres de santé</Text>
          <Text style={styles.sub}>Trouver une PMI, clinique, hôpital</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Nom du centre, ville…"
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={load}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={load}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Aucun centre trouvé</Text>
              <Text style={styles.emptyText}>Essayez d'autres mots-clés ou région</Text>
            </View>
          ) : (
            list.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.card}
                onPress={() => Alert.alert(c.nom_centre, `${c.adresse || ""}\n${c.ville || ""} · ${c.region || ""}\n${c.telephone || c.email_contact || ""}`)}
              >
                <LinearGradient
                  colors={["#A855F7", "#6366F1"]}
                  style={styles.cardIcon}
                >
                  <Ionicons name="business" size={24} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{c.nom_centre}</Text>
                  <Text style={styles.cardSub}>
                    {TYPE_LABELS[c.type_etablissement] || c.type_etablissement}
                  </Text>
                  <View style={styles.cardMeta}>
                    {c.ville && (
                      <View style={styles.metaTag}>
                        <Ionicons name="location-outline" size={12} color="#7E22CE" />
                        <Text style={styles.metaText}>{c.ville}</Text>
                      </View>
                    )}
                    {c.region && (
                      <View style={styles.metaTag}>
                        <Ionicons name="map-outline" size={12} color="#7E22CE" />
                        <Text style={styles.metaText}>{c.region}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: SPACING.lg, marginBottom: 8 },
  searchInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  filterBtn: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  cardIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  cardSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cardMeta: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  metaTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F3E8FF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  metaText: { fontSize: 11, color: "#7E22CE", fontWeight: "600" },
});
