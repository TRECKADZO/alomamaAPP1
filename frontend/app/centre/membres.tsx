import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function CentreMembres() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [centre, setCentre] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const [m, c] = await Promise.all([
        api.get("/centre/membres"),
        api.get("/centres/mine").catch(() => ({ data: null })),
      ]);
      setList(m.data);
      setCentre(c.data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const removeMember = (proId: string, name: string) => {
    Alert.alert("Retirer ce pro ?", name, [
      { text: "Annuler" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          try {
            await api.post("/centre/membres/remove", { pro_id: proId });
            load();
          } catch (e) { Alert.alert("Erreur", formatError(e)); }
        },
      },
    ]);
  };

  const filtered = list.filter((p) => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.specialite?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Professionnels du centre</Text>
          <Text style={styles.sub}>{list.length} membre(s)</Text>
        </View>
      </LinearGradient>

      {/* Code d'invitation */}
      {centre && (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Code d'invitation</Text>
          <Text style={styles.codeValue}>{centre.code_invitation}</Text>
          <Text style={styles.codeHint}>Partagez ce code avec vos pros à l'inscription</Text>
        </View>
      )}

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Rechercher par nom ou spécialité..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingTop: 0, paddingBottom: 60 }}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun professionnel</Text>
            <Text style={styles.emptyText}>Partagez votre code d'invitation pour recruter des pros.</Text>
          </View>
        ) : (
          filtered.map((p) => (
            <View key={p.id} style={styles.card}>
              <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name?.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                {p.specialite && <Text style={styles.meta}>{p.specialite}</Text>}
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: "#DBEAFE" }]}>
                    <Ionicons name="people" size={10} color="#1D4ED8" />
                    <Text style={[styles.badgeText, { color: "#1D4ED8" }]}>{p.patients_count} patientes</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: "#F3E8FF" }]}>
                    <Ionicons name="calendar" size={10} color="#7E22CE" />
                    <Text style={[styles.badgeText, { color: "#7E22CE" }]}>{p.rdv_count} RDV</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeMember(p.id, p.name)}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </TouchableOpacity>
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
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  codeCard: { backgroundColor: COLORS.surface, marginHorizontal: SPACING.lg, marginTop: -16, padding: 16, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", ...SHADOW },
  codeLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  codeValue: { color: "#A855F7", fontSize: 28, fontWeight: "800", letterSpacing: 4, marginVertical: 4 },
  codeHint: { color: COLORS.textMuted, fontSize: 11 },
  searchRow: { paddingHorizontal: SPACING.lg, marginTop: 12, marginBottom: 10 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  name: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14 },
  meta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  badgeText: { fontSize: 10, fontWeight: "800" },
});
