/**
 * Jalons & éveil — Développement psychomoteur OMS
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";

export default function JalonsEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api.get(`/enfants/${id}/jalons`);
        setData(r.data);
      } catch {} finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!data) return (
    <SafeAreaView style={styles.loading}>
      <Text style={{ color: COLORS.textPrimary }}>Aucun jalon disponible</Text>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ color: COLORS.primary, marginTop: 12 }}>Retour</Text></TouchableOpacity>
    </SafeAreaView>
  );

  const j = data.jalon || {};
  const tropJeune = data.trop_jeune;

  const Section = ({ icon, title, items, color }: any) => items?.length > 0 ? (
    <View style={[styles.section, { borderLeftColor: color }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
      {items.map((it: string, i: number) => (
        <View key={i} style={styles.itemRow}>
          <View style={[styles.bullet, { backgroundColor: color }]} />
          <Text style={styles.itemText}>{it}</Text>
        </View>
      ))}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎯 Jalons & éveil</Text>
          <Text style={styles.sub}>{data.age_mois} mois · Référentiel OMS</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
        <LinearGradient colors={["#A855F7", "#C084FC"]} style={styles.heroCard}>
          <Text style={styles.heroTitle}>{tropJeune ? "Trop jeune" : `Jalons à ${j.age_mois} mois`}</Text>
          {tropJeune ? (
            <Text style={styles.heroDesc}>L'enfant n'a pas encore atteint l'âge des premiers jalons (2 mois). En attendant, focus sur l'allaitement et la stimulation visuelle.</Text>
          ) : (
            <Text style={styles.heroDesc}>Les acquis suivants sont attendus à cet âge selon les standards OMS. En cas de retard significatif, consultez un pédiatre.</Text>
          )}
        </LinearGradient>

        <Section icon="🤲" title="Motricité" items={j.motricite} color="#3B82F6" />
        <Section icon="🗣️" title="Langage" items={j.langage} color="#10B981" />
        <Section icon="💞" title="Social & émotion" items={j.social} color="#EC4899" />
        <Section icon="🧠" title="Cognitif" items={j.cognitif} color="#F59E0B" />

        {j.alertes && j.alertes.length > 0 && (
          <View style={styles.alertCard}>
            <Ionicons name="warning" size={20} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>⚠️ Consulter un pro si…</Text>
              {j.alertes.map((a: string, i: number) => (
                <Text key={i} style={styles.alertItem}>• {a}</Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  heroCard: { padding: 16, borderRadius: RADIUS.lg, marginBottom: 14 },
  heroTitle: { color: "#fff", fontWeight: "800", fontSize: 17 },
  heroDesc: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 6, lineHeight: 17 },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4, padding: 14, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 },
  bullet: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  itemText: { flex: 1, fontSize: 13, color: COLORS.textPrimary, lineHeight: 19 },
  alertCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, borderWidth: 2, borderColor: "#F59E0B", marginTop: 10 },
  alertTitle: { color: "#B45309", fontWeight: "800", fontSize: 13, marginBottom: 6 },
  alertItem: { color: "#92400E", fontSize: 12, marginTop: 4, lineHeight: 17 },
});
