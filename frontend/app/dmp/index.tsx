/**
 * DMP — Détection Multi-domaine du Précoce
 * Index : sélection de l'enfant pour démarrer le bilan développemental.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function DmpIndex() {
  const router = useRouter();
  const [enfants, setEnfants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enfants").then((r) => setEnfants(r.data || [])).finally(() => setLoading(false));
  }, []);

  const ageLabel = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / (30.4375 * 86400000));
    if (m < 12) return `${m} mois`;
    const y = Math.floor(m / 12);
    const r = m - y * 12;
    return r ? `${y} an${y > 1 ? "s" : ""} ${r} mois` : `${y} an${y > 1 ? "s" : ""}`;
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#0EA5E9"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>DMP — Suivi développement</Text>
          <Text style={styles.sub}>Détection précoce sur 7 domaines</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="pulse" size={22} color="#fff" />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <View style={styles.intro}>
          <Ionicons name="information-circle" size={20} color="#0F766E" />
          <Text style={styles.introText}>
            <Text style={{ fontWeight: "800" }}>52 jalons</Text> répartis dans 7 domaines clés (moteur global,
            moteur fin, langage réceptif/expressif, cognitif, social-émotionnel, autonomie). Détection
            précoce avant l&apos;âge d&apos;alerte.
          </Text>
        </View>

        {enfants.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="happy-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucun enfant enregistré.</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/enfants")} style={styles.btnAdd}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.btnAddText}>Ajouter un enfant</Text>
            </TouchableOpacity>
          </View>
        ) : (
          enfants.map((e) => (
            <TouchableOpacity
              key={e.id}
              onPress={() => router.push(`/dmp/${e.id}`)}
              style={styles.card}
              testID={`dmp-enfant-${e.id}`}
            >
              <Text style={styles.emoji}>{e.sexe === "F" ? "👧" : "👦"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{e.nom}</Text>
                <Text style={styles.age}>{ageLabel(e.date_naissance)}</Text>
              </View>
              <View style={styles.cardCta}>
                <Text style={styles.cardCtaText}>Bilan</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  intro: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#ECFDF5", borderRadius: RADIUS.md, marginBottom: 16, borderWidth: 1, borderColor: "#A7F3D0" },
  introText: { flex: 1, color: "#065F46", fontSize: 12, lineHeight: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  emoji: { fontSize: 32 },
  name: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  age: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cardCta: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.primaryLight, borderRadius: 999 },
  cardCtaText: { color: COLORS.primary, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.textSecondary, marginTop: 10, marginBottom: 16 },
  btnAdd: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  btnAddText: { color: "#fff", fontWeight: "800" },
});
