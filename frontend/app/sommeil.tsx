import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";
import DateField from "../components/DateField";

const KEY = "sommeil_entries_v1";

export default function SuiviSommeil() {
  const router = useRouter();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), heures: "7", qualite: 3, notes: "" });

  const load = async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      setEntries(raw ? JSON.parse(raw) : []);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const save = async () => {
    if (!form.date || !form.heures) return Alert.alert("Champs requis", "Date et heures requis");
    const list = [{ id: Date.now().toString(), ...form, heures: parseFloat(form.heures), created_at: new Date().toISOString() }, ...entries];
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
    setEntries(list);
    setModal(false);
    setForm({ date: new Date().toISOString().slice(0, 10), heures: "7", qualite: 3, notes: "" });
  };

  const remove = (id: string) => {
    Alert.alert("Supprimer ?", "Cette entrée", [
      { text: "Annuler" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
        const list = entries.filter((e) => e.id !== id);
        await AsyncStorage.setItem(KEY, JSON.stringify(list));
        setEntries(list);
      } },
    ]);
  };

  const stats = {
    total: entries.length,
    moyenneHeures: entries.length ? (entries.reduce((s, e) => s + (e.heures || 0), 0) / entries.length).toFixed(1) : "-",
    moyenneQualite: entries.length ? (entries.reduce((s, e) => s + (e.qualite || 0), 0) / entries.length).toFixed(1) : "-",
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Suivi sommeil</Text>
          <Text style={styles.sub}>Mesurez la qualité de votre repos</Text>
        </View>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>SOMMEIL MOYEN</Text>
              <Text style={styles.heroValue}>{stats.moyenneHeures} h</Text>
              <Text style={styles.heroSub}>Qualité moyenne {stats.moyenneQualite}/5</Text>
            </View>
            <Ionicons name="moon" size={48} color="rgba(255,255,255,0.5)" />
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Mon journal de sommeil ({stats.total})</Text>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune entrée</Text>
            <Text style={styles.emptyText}>Commencez à suivre votre sommeil pour mieux vous reposer.</Text>
          </View>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.card}>
              <View style={[styles.qualityChip, { backgroundColor: e.qualite >= 4 ? "#DCFCE7" : e.qualite >= 3 ? "#FEF3C7" : "#FEE2E2" }]}>
                <Text style={[styles.qualityText, { color: e.qualite >= 4 ? "#166534" : e.qualite >= 3 ? "#92400E" : "#991B1B" }]}>{e.qualite}/5</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardDate}>{new Date(e.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}</Text>
                <Text style={styles.cardHours}>{e.heures} h de sommeil</Text>
                {e.notes ? <Text style={styles.cardNotes}>{e.notes}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => remove(e.id)}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouvelle entrée</Text>
              <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Date</Text>
            <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} maximumDate={new Date()} placeholder="Choisir la date" />
            <Text style={styles.label}>Heures de sommeil</Text>
            <TextInput style={styles.input} value={form.heures} onChangeText={(v) => setForm({ ...form, heures: v })} keyboardType="decimal-pad" />
            <Text style={styles.label}>Qualité (1-5)</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setForm({ ...form, qualite: n })}
                  style={[styles.qBtn, form.qualite === n && { backgroundColor: "#6366F1", borderColor: "#6366F1" }]}
                >
                  <Text style={[styles.qBtnText, form.qualite === n && { color: "#fff" }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Notes (optionnel)</Text>
            <TextInput style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Réveils, rêves, fatigue..." placeholderTextColor={COLORS.textMuted} />
            <TouchableOpacity onPress={save}>
              <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Enregistrer</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#6366F1", alignItems: "center", justifyContent: "center" },

  heroCard: { borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, ...SHADOW },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  heroValue: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4, textAlign: "center" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  qualityChip: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  qualityText: { fontWeight: "800", fontSize: 13 },
  cardDate: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13, textTransform: "capitalize" },
  cardHours: { color: "#6366F1", fontSize: 14, fontWeight: "700", marginTop: 2 },
  cardNotes: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontStyle: "italic" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  qBtn: { flex: 1, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  qBtnText: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  btnPrimary: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 18 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
