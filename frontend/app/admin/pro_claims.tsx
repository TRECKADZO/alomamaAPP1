/**
 * Admin — Validation des demandes pro d'établissement
 */
import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "../../lib/api";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#FEF3C7", fg: "#B45309" },
  approved: { bg: "#DCFCE7", fg: "#059669" },
  auto_approved: { bg: "#DBEAFE", fg: "#1E40AF" },
  rejected: { bg: "#FEE2E2", fg: "#DC2626" },
};

export default function AdminProClaimsScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("pending");

  const load = async () => {
    try {
      const r = await api.get(`/admin/pro_claims${filter ? `?status=${filter}` : ""}`);
      setItems(r.data?.claims || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [filter]));

  const review = async (id: string, decision: "approve" | "reject") => {
    Alert.alert(
      decision === "approve" ? "Approuver ?" : "Rejeter ?",
      "Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: decision === "approve" ? "Approuver" : "Rejeter",
          style: decision === "reject" ? "destructive" : "default",
          onPress: async () => {
            try {
              await api.post(`/admin/pro_claims/${id}/review`, { decision });
              load();
            } catch (e: any) {
              Alert.alert("Erreur", e?.response?.data?.detail || "Échec");
            }
          },
        },
      ]
    );
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow} style={s.filterWrap}>
        {["pending", "approved", "auto_approved", "rejected", ""].map((f) => (
          <TouchableOpacity key={f || "all"} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipActive]}>
            <Text style={[s.chipTxt, filter === f && s.chipTxtActive]}>{f || "Toutes"}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {items.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📋</Text>
            <Text style={s.emptyTxt}>Aucune demande {filter && `en statut « ${filter} »`}</Text>
          </View>
        ) : items.map((c) => {
          const color = STATUS_COLORS[c.status] || STATUS_COLORS.pending;
          return (
            <View key={c.id} style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.name}>{c.nom_complet}</Text>
                <View style={[s.statusBadge, { backgroundColor: color.bg }]}>
                  <Text style={[s.statusTxt, { color: color.fg }]}>{c.status.replace("_", " ")}</Text>
                </View>
              </View>
              <Text style={s.etab}>🏥 {c.etablissement_nom}</Text>
              <View style={s.metaRow}>
                <Text style={s.meta}>{c.specialite} · {c.numero_ordre}</Text>
                <Text style={s.score}>Score: {c.cross_check_score}/100</Text>
              </View>
              <Text style={s.email}>📧 {c.user_email}</Text>
              {c.message && <Text style={s.message}>💬 {c.message}</Text>}
              <Text style={s.date}>{new Date(c.created_at).toLocaleString("fr-FR")}</Text>
              {c.status === "pending" && (
                <View style={s.actions}>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#DC2626" }]} onPress={() => review(c.id, "reject")}>
                    <Ionicons name="close" size={16} color="#fff" />
                    <Text style={s.actionTxt}>Rejeter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#059669" }]} onPress={() => review(c.id, "approve")}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={s.actionTxt}>Approuver</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  filterWrap: { maxHeight: 52, backgroundColor: "#fff" },
  filterRow: { padding: 12, gap: 6, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#F1F5F9", borderRadius: 999 },
  chipActive: { backgroundColor: "#EC4899" },
  chipTxt: { color: "#334155", fontSize: 12, fontWeight: "700" },
  chipTxtActive: { color: "#fff" },
  empty: { padding: 60, alignItems: "center" },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: "#64748B" },
  card: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 8 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  name: { fontWeight: "800", color: "#0F172A", fontSize: 14, flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusTxt: { fontSize: 10, fontWeight: "800" },
  etab: { color: "#334155", fontSize: 13, marginTop: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  meta: { color: "#64748B", fontSize: 11 },
  score: { color: "#EC4899", fontSize: 11, fontWeight: "800" },
  email: { color: "#64748B", fontSize: 11, marginTop: 2 },
  message: { color: "#0F172A", fontSize: 12, marginTop: 6, fontStyle: "italic", padding: 8, backgroundColor: "#F1F5F9", borderRadius: 6 },
  date: { color: "#94A3B8", fontSize: 10, marginTop: 6 },
  actions: { flexDirection: "row", gap: 6, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 10, borderRadius: 8 },
  actionTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
