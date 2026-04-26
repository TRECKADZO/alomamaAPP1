import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function FamilleSharedView() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!email) { setLoading(false); return; }
      try {
        const { data } = await api.get(`/famille/shared/${encodeURIComponent(email)}`);
        if (!cancelled) { setData(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (error || !data) return (
    <SafeAreaView style={styles.loading}>
      <Text style={{ color: COLORS.error, marginBottom: 12, textAlign: "center", paddingHorizontal: 20 }}>
        {error || "Accès refusé"}
      </Text>
      <TouchableOpacity style={{ backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 }} onPress={() => router.back()}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>Retour</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const { owner, permissions, grossesse, enfants, rdvs } = data;
  const weeksSA = grossesse?.date_debut ? Math.floor((Date.now() - new Date(grossesse.date_debut).getTime()) / (7 * 86400000)) : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#F59E0B", "#EF4444"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={styles.avatar}><Text style={styles.avatarText}>{owner.name?.charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{owner.name}</Text>
          <Text style={styles.sub}>Vue partagée famille</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Grossesse */}
        {permissions.grossesse && grossesse && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <LinearGradient colors={["#F472B6", "#FB7185"]} style={styles.cardIcon}><Ionicons name="heart" size={18} color="#fff" /></LinearGradient>
              <Text style={styles.cardTitle}>Grossesse</Text>
            </View>
            <Text style={styles.bigStat}>{weeksSA} SA</Text>
            <Text style={styles.cardMeta}>Début : {new Date(grossesse.date_debut).toLocaleDateString("fr-FR")}</Text>
            {permissions.grossesse_details && grossesse.date_terme && (
              <Text style={styles.cardMeta}>DPA : {new Date(grossesse.date_terme).toLocaleDateString("fr-FR")}</Text>
            )}
          </View>
        )}

        {/* Enfants */}
        {permissions.enfants && enfants && enfants.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <LinearGradient colors={["#3B82F6", "#06B6D4"]} style={styles.cardIcon}><Ionicons name="happy" size={18} color="#fff" /></LinearGradient>
              <Text style={styles.cardTitle}>Enfants ({enfants.length})</Text>
            </View>
            {enfants.map((e: any) => (
              <View key={e.id} style={styles.childRow}>
                <Text style={styles.childEmoji}>{e.sexe === "F" ? "\u{1F467}" : "\u{1F466}"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.childName}>{e.nom}</Text>
                  <Text style={styles.childMeta}>{new Date(e.date_naissance).toLocaleDateString("fr-FR")}</Text>
                </View>
                {permissions.enfants_details && e.groupe_sanguin && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{e.groupe_sanguin}</Text></View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* RDV */}
        {permissions.rendez_vous && rdvs && rdvs.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.cardIcon}><Ionicons name="calendar" size={18} color="#fff" /></LinearGradient>
              <Text style={styles.cardTitle}>Rendez-vous ({rdvs.length})</Text>
            </View>
            {rdvs.slice(0, 5).map((r: any) => (
              <View key={r.id} style={styles.rdvRow}>
                <Ionicons name="medical" size={14} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rdvTitle}>{r.motif || "Consultation"}</Text>
                  <Text style={styles.rdvMeta}>{new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
                <Text style={styles.rdvStatus}>{r.statut || "en_attente"}</Text>
              </View>
            ))}
          </View>
        )}

        {!permissions.grossesse && !permissions.enfants && !permissions.rendez_vous && (
          <View style={styles.empty}>
            <Ionicons name="lock-closed" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Accès restreint</Text>
            <Text style={styles.emptyText}>{owner.name} ne vous a encore donné accès à aucune donnée.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, ...SHADOW },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  cardIcon: { width: 36, height: 36, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14 },
  cardMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  bigStat: { fontSize: 36, fontWeight: "800", color: "#EC4899" },
  childRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  childEmoji: { fontSize: 24 },
  childName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  childMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  badge: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill },
  badgeText: { color: "#991B1B", fontSize: 11, fontWeight: "800" },
  rdvRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rdvTitle: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  rdvMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  rdvStatus: { color: COLORS.primary, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 6, textAlign: "center" },
});
