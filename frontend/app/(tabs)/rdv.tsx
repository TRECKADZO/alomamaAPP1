import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Rdv() {
  const { user } = useAuth();
  const router = useRouter();
  const [rdv, setRdv] = useState<any[]>([]);
  const [pros, setPros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ pro_id: "", date: "", motif: "" });

  const load = async () => {
    try {
      const { data } = await api.get("/rdv");
      setRdv(data);
      if (user?.role === "maman") {
        const p = await api.get("/professionnels");
        setPros(p.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  const create = async () => {
    if (!form.pro_id || !form.date || !form.motif) return Alert.alert("Champs requis");
    try {
      await api.post("/rdv", form);
      setForm({ pro_id: "", date: "", motif: "" });
      setModal(false);
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const changeStatus = async (rid: string, statusVal: string) => {
    try {
      await api.patch(`/rdv/${rid}/status?status_val=${statusVal}`);
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Rendez-vous</Text>
        {user?.role === "maman" && (
          <TouchableOpacity style={styles.addHeader} onPress={() => setModal(true)} testID="add-rdv-btn">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 10, paddingBottom: 60 }}>
        {rdv.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun rendez-vous</Text>
            <Text style={styles.emptyText}>
              {user?.role === "maman" ? "Prenez rendez-vous avec un professionnel" : "Vos RDV apparaîtront ici"}
            </Text>
          </View>
        ) : (
          rdv.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.dateChip, { backgroundColor: COLORS.primaryLight }]}>
                  <Text style={styles.dateDay}>{new Date(r.date).getDate()}</Text>
                  <Text style={styles.dateMonth}>
                    {new Date(r.date).toLocaleString("fr-FR", { month: "short" })}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>
                    {user?.role === "maman" ? r.pro_name : r.maman_name}
                  </Text>
                  <Text style={styles.cardSub}>
                    {user?.role === "maman" ? r.pro_specialite : "Patiente"}
                  </Text>
                  <Text style={styles.cardMotif}>📋 {r.motif}</Text>
                  <Text style={styles.cardTime}>
                    🕐 {new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <StatusBadge status={r.status} />
              </View>

              {user?.role === "professionnel" && r.status === "en_attente" && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => changeStatus(r.id, "confirme")}>
                    <Ionicons name="checkmark" size={16} color={COLORS.success} />
                    <Text style={[styles.actionText, { color: COLORS.success }]}>Confirmer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => changeStatus(r.id, "annule")}>
                    <Ionicons name="close" size={16} color={COLORS.error} />
                    <Text style={[styles.actionText, { color: COLORS.error }]}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              )}
              {user?.role === "professionnel" && r.status === "confirme" && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <TouchableOpacity style={[styles.actionBtn]} onPress={() => changeStatus(r.id, "termine")}>
                    <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
                    <Text style={[styles.actionText, { color: COLORS.primary }]}>Marquer terminé</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn]} onPress={() => router.push(`/video-call/${r.id}`)} testID={`video-${r.id}`}>
                    <Ionicons name="videocam" size={16} color={COLORS.success} />
                    <Text style={[styles.actionText, { color: COLORS.success }]}>Démarrer vidéo</Text>
                  </TouchableOpacity>
                </View>
              )}
              {user?.role === "maman" && r.status === "confirme" && (
                <TouchableOpacity style={[styles.actionBtn, { alignSelf: "flex-start", marginTop: 10 }]} onPress={() => router.push(`/video-call/${r.id}`)} testID={`video-${r.id}`}>
                  <Ionicons name="videocam" size={16} color={COLORS.success} />
                  <Text style={[styles.actionText, { color: COLORS.success }]}>Rejoindre la visio</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouveau rendez-vous</Text>
                <TouchableOpacity onPress={() => setModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Professionnel</Text>
              {pros.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.proCard, form.pro_id === p.id && styles.proCardActive]}
                  onPress={() => setForm({ ...form, pro_id: p.id })}
                  testID={`pro-${p.id}`}
                >
                  <View style={styles.proAvatar}>
                    <Text style={styles.proAvatarText}>{p.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proName}>{p.name}</Text>
                    <Text style={styles.proSpec}>{p.specialite || "Professionnel"}</Text>
                  </View>
                  {form.pro_id === p.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Date et heure (YYYY-MM-DDTHH:MM)</Text>
              <TextInput
                style={styles.input}
                value={form.date}
                onChangeText={(v) => setForm({ ...form, date: v })}
                placeholder="2026-05-15T10:30"
                placeholderTextColor={COLORS.textMuted}
                testID="rdv-date"
              />

              <Text style={styles.label}>Motif de consultation</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={form.motif}
                onChangeText={(v) => setForm({ ...form, motif: v })}
                multiline
                placeholder="Ex: Consultation prénatale"
                placeholderTextColor={COLORS.textMuted}
                testID="rdv-motif"
              />

              <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-rdv-btn">
                <Text style={styles.btnPrimaryText}>Confirmer la demande</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    en_attente: { bg: "#FFF3E0", fg: "#E88C00", label: "En attente" },
    confirme: { bg: COLORS.secondaryLight, fg: "#3E5249", label: "Confirmé" },
    annule: { bg: "#FEE2E2", fg: COLORS.error, label: "Annulé" },
    termine: { bg: "#E0F2FE", fg: "#0369A1", label: "Terminé" },
  };
  const c = map[status] || map.en_attente;
  return <Text style={[styles.statusBadge, { backgroundColor: c.bg, color: c.fg }]}>{c.label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  addHeader: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardTop: { flexDirection: "row", gap: 12 },
  dateChip: { width: 56, height: 56, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  dateDay: { fontSize: 22, fontWeight: "800", color: COLORS.primary },
  dateMonth: { fontSize: 10, fontWeight: "700", color: COLORS.primary, textTransform: "uppercase" },
  cardName: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  cardSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cardMotif: { color: COLORS.textPrimary, fontSize: 13, marginTop: 4 },
  cardTime: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  statusBadge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, textTransform: "uppercase", alignSelf: "flex-start" },
  actions: { flexDirection: "row", gap: 16, marginTop: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontWeight: "600", fontSize: 13 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  proCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  proCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  proAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  proAvatarText: { color: "#fff", fontWeight: "800" },
  proName: { fontWeight: "700", color: COLORS.textPrimary },
  proSpec: { color: COLORS.textSecondary, fontSize: 12 },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
