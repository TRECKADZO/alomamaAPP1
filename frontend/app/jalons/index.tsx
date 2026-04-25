import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function JalonsIndex() {
  const router = useRouter();
  const [enfants, setEnfants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enfants").then((r) => { setEnfants(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const ageFromDate = (iso: string) => {
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Étapes de développement</Text>
          <Text style={styles.sub}>Bilan développemental par âge</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <View style={styles.intro}>
          <Ionicons name="information-circle" size={20} color="#0F766E" />
          <Text style={styles.introText}>
            Vérifiez les acquis de votre enfant à son âge selon les jalons OMS. Sélectionnez un enfant pour démarrer le bilan.
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
            <TouchableOpacity key={e.id} onPress={() => router.push(`/jalons/${e.id}`)} style={styles.card} testID={`enfant-${e.id}`}>
              <Text style={styles.emoji}>{e.sexe === "F" ? "👧" : "👦"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{e.nom}</Text>
                <Text style={styles.age}>{ageFromDate(e.date_naissance)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
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
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  intro: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#ECFDF5", borderRadius: RADIUS.md, marginBottom: 16, borderWidth: 1, borderColor: "#A7F3D0" },
  introText: { flex: 1, color: "#065F46", fontSize: 12, lineHeight: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  emoji: { fontSize: 32 },
  name: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  age: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.textSecondary, marginTop: 10, marginBottom: 16 },
  btnAdd: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  btnAddText: { color: "#fff", fontWeight: "800" },
});
