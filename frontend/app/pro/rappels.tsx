import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function RappelsEnvoyes() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/pro/rappels-envoyes");
      setList(data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const actifs = list.filter((r) => !r.done);
  const termines = list.filter((r) => r.done);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rappels envoyés</Text>
          <Text style={styles.sub}>Rappels envoyés aux patientes</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <LinearGradient colors={["#FEF3C7", "#FED7AA"]} style={styles.heroCard}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>RAPPELS ACTIFS</Text>
              <Text style={styles.heroValue}>{actifs.length}</Text>
              <Text style={styles.heroSub}>{termines.length} terminés</Text>
            </View>
            <Ionicons name="alarm" size={48} color="rgba(234,88,12,0.5)" />
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Actifs ({actifs.length})</Text>
        {actifs.length === 0 ? (
          <Text style={styles.empty}>Aucun rappel actif</Text>
        ) : (
          actifs.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={[styles.cardIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="alarm" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                <Text style={styles.cardMeta}>Échéance : {new Date(r.due_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
                {r.notes ? <Text style={styles.cardNotes}>{r.notes}</Text> : null}
              </View>
            </View>
          ))
        )}

        {termines.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Terminés ({termines.length})</Text>
            {termines.map((r) => (
              <View key={r.id} style={[styles.card, { opacity: 0.6 }]}>
                <View style={[styles.cardIcon, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { textDecorationLine: "line-through" }]}>{r.title}</Text>
                  <Text style={styles.cardMeta}>{new Date(r.due_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              </View>
            ))}
          </>
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
  heroCard: { borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW },
  heroLabel: { color: "#9A3412", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  heroValue: { color: "#7C2D12", fontSize: 36, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "#9A3412", fontSize: 13, marginTop: 4 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginBottom: 8, marginTop: 8 },
  empty: { color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", paddingVertical: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  cardIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  cardMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  cardNotes: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontStyle: "italic" },
});
