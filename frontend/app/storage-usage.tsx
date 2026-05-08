/**
 * Utilisation du stockage 💾
 * Affiche la consommation actuelle vs limite (50 Mo gratuit / 2 Go Premium).
 * Route: /storage-usage
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function StorageUsage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/maman/storage");
      setData(r.data);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  if (!data) return null;

  const barColor = data.percent >= 100 ? "#EF4444" : data.percent >= 80 ? "#F59E0B" : "#10B981";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EC4899", "#BE185D"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Stockage 💾</Text>
          <Text style={styles.sub}>Photos, documents, échographies</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        <View style={styles.bigCard}>
          <Text style={styles.usedLabel}>Utilisé</Text>
          <Text style={styles.usedValue}>
            {data.used_mb} Mo <Text style={styles.usedTotal}>/ {data.label_limit}</Text>
          </Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${Math.min(100, data.percent)}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={[styles.percent, { color: barColor }]}>{data.percent}%</Text>
        </View>

        {data.warning && (
          <View style={styles.warnBox}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <Text style={styles.warnText}>
              Vous avez utilisé {data.percent}% de votre stockage. {data.is_premium ? "Pensez à archiver ou supprimer d'anciens fichiers." : "Passez Premium pour 2 Go au lieu de 50 Mo."}
            </Text>
          </View>
        )}

        {data.blocked && (
          <View style={styles.errorBox}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>Stockage plein. Impossible d'ajouter de nouveaux documents.</Text>
          </View>
        )}

        {!data.is_premium && (
          <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push("/premium")}>
            <Ionicons name="diamond" size={18} color="#fff" />
            <Text style={styles.upgradeText}>Passer à 2 Go avec Maman Premium</Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Que stockez-vous ?</Text>
          <Text style={styles.infoLine}>• Photos de vos enfants (carnet de santé)</Text>
          <Text style={styles.infoLine}>• Images d'échographies</Text>
          <Text style={styles.infoLine}>• Documents médicaux uploadés</Text>
          <Text style={styles.infoLine}>• PDF de comptes-rendus</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  bigCard: { backgroundColor: COLORS.surface, padding: 24, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  usedLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  usedValue: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary },
  usedTotal: { fontSize: 16, color: COLORS.textSecondary, fontWeight: "600" },
  barBg: { width: "100%", height: 14, backgroundColor: "#F3F4F6", borderRadius: 7, marginTop: 14, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 7 },
  percent: { fontSize: 14, fontWeight: "800", marginTop: 8 },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, marginBottom: 12 },
  warnText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#FEE2E2", borderRadius: RADIUS.md, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 12, color: "#991B1B", lineHeight: 17, fontWeight: "700" },
  upgradeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, backgroundColor: "#EC4899", borderRadius: RADIUS.md, marginBottom: 16 },
  upgradeText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  infoBox: { backgroundColor: COLORS.surface, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  infoTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  infoLine: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 19 },
});
