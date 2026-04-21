import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function AdminAudit() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/audit");
      setData(data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading || !data) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#C85A40", "#A64A35"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Audit & logs</Text>
          <Text style={styles.sub}>Dernières activités</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <Text style={styles.sectionTitle}>Derniers utilisateurs inscrits</Text>
        {data.recent_users.map((u: any) => (
          <View key={u.id} style={styles.card}>
            <View style={[styles.cardIcon, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="person" size={16} color="#1D4ED8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{u.name}</Text>
              <Text style={styles.cardMeta}>{u.email} · {u.role}</Text>
            </View>
            <Text style={styles.cardDate}>{new Date(u.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Derniers RDV créés</Text>
        {data.recent_rdv.map((r: any) => (
          <View key={r.id} style={styles.card}>
            <View style={[styles.cardIcon, { backgroundColor: "#F3E8FF" }]}>
              <Ionicons name="calendar" size={16} color="#7E22CE" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{r.motif || "RDV"}</Text>
              <Text style={styles.cardMeta}>{r.statut || "en_attente"}</Text>
            </View>
            <Text style={styles.cardDate}>{new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Derniers centres enregistrés</Text>
        {data.recent_centres.map((c: any) => (
          <View key={c.id} style={styles.card}>
            <View style={[styles.cardIcon, { backgroundColor: "#FCE7F3" }]}>
              <Ionicons name="business" size={16} color="#BE185D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{c.nom_centre}</Text>
              <Text style={styles.cardMeta}>{c.type_etablissement} · {c.ville || "-"}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14, marginTop: 14, marginBottom: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  cardIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  cardMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  cardDate: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700" },
});
