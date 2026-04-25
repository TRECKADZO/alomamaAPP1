import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import DateField from "../../components/DateField";

export default function RappelsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reminders");
      setItems(data || []);
    } catch { /* */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim() || !dueAt) { Alert.alert("Champs requis", "Titre et date sont requis"); return; }
    setSubmitting(true);
    try {
      await api.post("/reminders", { title: title.trim(), note: note.trim(), due_at: new Date(dueAt).toISOString() });
      setShowAdd(false); setTitle(""); setNote(""); setDueAt(""); load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); } finally { setSubmitting(false); }
  };

  const toggleDone = async (r: any) => {
    try { await api.patch(`/reminders/${r.id}`, { done: !r.done }); load(); }
    catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const remove = async (id: string) => {
    Alert.alert("Supprimer ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
          try { await api.delete(`/reminders/${id}`); load(); }
          catch (e) { Alert.alert("Erreur", formatError(e)); }
      } }
    ]);
  };

  const upcoming = items.filter((i) => !i.done).sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const done = items.filter((i) => i.done);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EF4444", "#F87171"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🔔 Mes rappels</Text>
          <Text style={styles.sub}>{upcoming.length} à venir · {done.length} fait(s)</Text>
        </View>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addHeaderBtn} testID="add-rappel-btn">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {loading ? <ActivityIndicator color="#EF4444" style={{ marginTop: 30 }} /> : (
          <>
            <Text style={styles.sectionTitle}>📅 À venir ({upcoming.length})</Text>
            {upcoming.length === 0 ? <Text style={styles.empty}>Aucun rappel à venir</Text> :
              upcoming.map((r) => (
                <TouchableOpacity key={r.id} onPress={() => toggleDone(r)} onLongPress={() => remove(r.id)} style={styles.itemRow} testID={`rappel-${r.id}`}>
                  <View style={styles.itemCheck}><Ionicons name="alarm" size={20} color="#EF4444" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{r.title}</Text>
                    {r.description && <Text style={styles.itemNote}>{r.description}</Text>}
                    {r.note && <Text style={styles.itemNote}>{r.note}</Text>}
                    <Text style={styles.itemDate}>{new Date(r.due_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                </TouchableOpacity>
              ))
            }

            {done.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 18 }]}>✅ Faits ({done.length})</Text>
                {done.slice(0, 10).map((r) => (
                  <TouchableOpacity key={r.id} onPress={() => toggleDone(r)} onLongPress={() => remove(r.id)} style={[styles.itemRow, { opacity: 0.6 }]} testID={`done-${r.id}`}>
                    <View style={[styles.itemCheck, { backgroundColor: "#DCFCE7" }]}><Ionicons name="checkmark" size={20} color="#16A34A" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { textDecorationLine: "line-through" }]}>{r.title}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <Text style={styles.tip}>💡 Tap pour cocher · Long appui pour supprimer</Text>
          </>
        )}
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouveau rappel</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Ionicons name="close" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Titre *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ex: Prendre acide folique" placeholderTextColor={COLORS.textMuted} testID="rappel-title" />
            <Text style={styles.label}>Date / heure *</Text>
            <DateField value={dueAt} onChange={setDueAt} mode="datetime" minimumDate={new Date()} placeholder="Choisir date et heure" />
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]} value={note} onChangeText={setNote} multiline placeholder="Détails additionnels..." placeholderTextColor={COLORS.textMuted} testID="rappel-note" />
            <TouchableOpacity onPress={create} disabled={submitting} style={styles.btn} testID="save-rappel-btn">
              {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
              <Text style={styles.btnText}>{submitting ? "..." : "Créer le rappel"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  addHeaderBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  itemCheck: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  itemTitle: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  itemNote: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  itemDate: { color: "#EF4444", fontSize: 11, fontWeight: "700", marginTop: 4 },
  empty: { color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", marginVertical: 14 },
  tip: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 16 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, paddingBottom: 40 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", paddingVertical: 14, borderRadius: 999, marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
