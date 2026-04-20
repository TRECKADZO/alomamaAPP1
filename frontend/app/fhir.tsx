import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function FhirScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: bundle } = await api.get("/fhir/patient");
      setData(bundle);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };

  const share = async () => {
    if (!data) return;
    const txt = JSON.stringify(data, null, 2);
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(txt);
        Alert.alert("Copié", "Le bundle FHIR a été copié dans le presse-papiers");
      } else {
        await Share.share({ message: txt, title: "Bundle FHIR À lo Maman" });
      }
    } catch {}
  };

  const entries = data?.entry || [];
  const byType: Record<string, number> = {};
  entries.forEach((e: any) => {
    const t = e.resource?.resourceType || "Unknown";
    byType[t] = (byType[t] || 0) + 1;
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Dossier Médical (FHIR)</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0 }}>
        <View style={styles.intro}>
          <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
          <Text style={styles.introText}>
            Exportez l'intégralité de votre dossier médical au format standard **FHIR** (HL7),
            pour partage avec un professionnel de santé ou une autre application.
          </Text>
        </View>

        <TouchableOpacity style={styles.btnPrimary} onPress={load} disabled={loading} testID="fhir-export-btn">
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="cloud-download" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Générer mon dossier FHIR</Text>
            </>
          )}
        </TouchableOpacity>

        {data && (
          <>
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>Bundle généré ✅</Text>
              <Text style={styles.statsSub}>{entries.length} ressources · Type: {data.type}</Text>
              {Object.entries(byType).map(([t, n]) => (
                <View key={t} style={styles.statRow}>
                  <Ionicons name={iconFor(t)} size={16} color={COLORS.primary} />
                  <Text style={styles.statLabel}>{t}</Text>
                  <Text style={styles.statValue}>{n}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.btnSecondary} onPress={share} testID="fhir-share-btn">
              <Ionicons name="share-social" size={18} color={COLORS.primary} />
              <Text style={styles.btnSecondaryText}>Partager / Copier le JSON</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function iconFor(t: string): any {
  return { Patient: "person", RelatedPerson: "people", Observation: "analytics", Immunization: "medical" }[t] || "document";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  intro: { flexDirection: "row", gap: 12, backgroundColor: COLORS.secondaryLight, padding: 16, borderRadius: RADIUS.md, marginBottom: 20 },
  introText: { flex: 1, color: COLORS.textPrimary, lineHeight: 20, fontSize: 13 },
  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.surface, paddingVertical: 14, borderRadius: RADIUS.pill, marginTop: 10, borderWidth: 1, borderColor: COLORS.primary },
  btnSecondaryText: { color: COLORS.primary, fontWeight: "700" },
  statsCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: 20 },
  statsTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  statsSub: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 10 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  statLabel: { flex: 1, color: COLORS.textPrimary, fontWeight: "500" },
  statValue: { color: COLORS.primary, fontWeight: "800" },
});
