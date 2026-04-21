import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default function CentreCalendrier() {
  const router = useRouter();
  const [rdvs, setRdvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date());

  const load = async () => {
    try {
      const { data } = await api.get("/centre/rdv");
      setRdvs(data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const month = date.getMonth();
  const year = date.getFullYear();
  const monthRdvs = rdvs
    .filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group by day
  const byDay: Record<string, any[]> = {};
  monthRdvs.forEach((r) => {
    const k = new Date(r.date).toDateString();
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(r);
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Calendrier du centre</Text>
          <Text style={styles.sub}>{rdvs.length} RDV total</Text>
        </View>
      </LinearGradient>

      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setDate(new Date(year, month - 1, 1))} style={styles.navBtn}><Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.monthLabel}>{MOIS_FR[month]} {year}</Text>
        <TouchableOpacity onPress={() => setDate(new Date(year, month + 1, 1))} style={styles.navBtn}><Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {monthRdvs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun RDV ce mois</Text>
            <Text style={styles.emptyText}>Les consultations apparaissent ici.</Text>
          </View>
        ) : (
          Object.entries(byDay).map(([day, list]) => (
            <View key={day} style={{ marginBottom: 16 }}>
              <Text style={styles.dayHead}>{new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}</Text>
              {list.map((r: any) => (
                <View key={r.id} style={styles.rdvCard}>
                  <View style={[styles.rdvIcon, { backgroundColor: r.statut === "confirme" ? "#DCFCE7" : "#FEF3C7" }]}>
                    <Ionicons name="medical" size={14} color={r.statut === "confirme" ? "#16A34A" : "#D97706"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rdvTitle}>{r.maman_name}</Text>
                    <Text style={styles.rdvMeta}>
                      {r.pro_name} · {new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {r.motif || "Consultation"}
                    </Text>
                  </View>
                  <Text style={[styles.statusTag, { color: r.statut === "confirme" ? "#16A34A" : "#D97706", backgroundColor: r.statut === "confirme" ? "#DCFCE7" : "#FEF3C7" }]}>{r.statut || "en_attente"}</Text>
                </View>
              ))}
            </View>
          ))
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
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg, paddingBottom: 8 },
  monthLabel: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, textTransform: "capitalize" },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4, textAlign: "center" },
  dayHead: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, textTransform: "capitalize", marginBottom: 8 },
  rdvCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  rdvIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rdvTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  rdvMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  statusTag: { fontSize: 9, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill, textTransform: "uppercase" },
});
