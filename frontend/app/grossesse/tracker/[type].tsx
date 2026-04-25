import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import DateField from "../../components/DateField";

type TrackingType = "poids" | "tension" | "symptome" | "journal" | "vaccin";

const META: Record<TrackingType, { title: string; emoji: string; color: [string, string]; placeholder: string; field: "value" | "text"; unit?: string; help?: string }> = {
  poids:    { title: "Suivi du poids",        emoji: "⚖️", color: ["#F59E0B", "#FB923C"], placeholder: "Ex: 65.5", field: "value", unit: "kg", help: "Prise de poids recommandée pendant la grossesse : 9-13 kg." },
  tension:  { title: "Suivi de la tension",   emoji: "❤️", color: ["#E11D48", "#F43F5E"], placeholder: "Ex: 12.5", field: "value", unit: "/8.0", help: "Tension normale : 12/8. Au-delà de 14/9, consultez en urgence." },
  symptome: { title: "Mes symptômes",         emoji: "🩺", color: ["#8B5CF6", "#A78BFA"], placeholder: "Ex: Nausées matinales", field: "text", help: "Notez l'apparition, l'intensité et la disparition de chaque symptôme." },
  journal:  { title: "Mon journal de grossesse", emoji: "📔", color: ["#6B7280", "#9CA3AF"], placeholder: "Comment vous sentez-vous aujourd'hui ?", field: "text", help: "Un espace personnel pour noter vos émotions, pensées, événements." },
  vaccin:   { title: "Mes vaccins",           emoji: "💉", color: ["#22C55E", "#10B981"], placeholder: "Ex: Vaccin coqueluche", field: "text", help: "Vaccins recommandés en grossesse : Tétanos, Coqueluche (28 SA), Grippe, COVID-19." },
};

const VACCINS_RECOMMANDES = [
  { nom: "Tétanos", quand: "Mise à jour si nécessaire", type: "vaccin" },
  { nom: "Coqueluche", quand: "À 28 SA (protège bébé à la naissance)", type: "vaccin" },
  { nom: "Grippe", quand: "Pendant la saison hivernale", type: "vaccin" },
  { nom: "COVID-19", quand: "Selon recommandations en cours", type: "vaccin" },
];

export default function TrackerScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: TrackingType }>();
  const t = (type || "poids") as TrackingType;
  const meta = META[t] || META.poids;
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [val1, setVal1] = useState("");
  const [val2, setVal2] = useState("");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/grossesse/tracking?type=${t}`);
      setEntries(data.entries || []);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [t]);

  const submit = async (overrideText?: string) => {
    setSubmitting(true);
    const payload: any = { type: t, date };
    if (meta.field === "value") {
      const v = parseFloat(val1.replace(",", "."));
      if (isNaN(v)) { Alert.alert("Valeur requise"); setSubmitting(false); return; }
      payload.value = v;
      if (t === "tension" && val2) {
        const v2 = parseFloat(val2.replace(",", "."));
        if (!isNaN(v2)) payload.value2 = v2;
      }
    } else {
      const txt = (overrideText || text).trim();
      if (!txt) { Alert.alert("Texte requis"); setSubmitting(false); return; }
      payload.text = txt;
    }
    if (notes.trim()) payload.notes = notes.trim();
    try {
      await api.post("/grossesse/tracking", payload);
      setShowAdd(false);
      setVal1(""); setVal2(""); setText(""); setNotes("");
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setSubmitting(false); }
  };

  const remove = (id: string) => {
    Alert.alert("Supprimer ?", "Cette entrée sera supprimée.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
          try { await api.delete(`/grossesse/tracking/${id}`); load(); }
          catch (e) { Alert.alert("Erreur", formatError(e)); }
      } }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={meta.color} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{meta.emoji} {meta.title}</Text>
          <Text style={styles.sub}>{entries.length} entrée(s)</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}>
        {meta.help && (
          <View style={styles.helpBox}>
            <Ionicons name="information-circle" size={18} color="#1E40AF" />
            <Text style={styles.helpText}>{meta.help}</Text>
          </View>
        )}

        {/* Vaccins recommandés (uniquement pour le type vaccin) */}
        {t === "vaccin" && (
          <View style={styles.vaccBox}>
            <Text style={styles.sectionTitle}>📋 Vaccins recommandés en grossesse</Text>
            {VACCINS_RECOMMANDES.map((v, i) => {
              const fait = entries.some((e) => e.text?.toLowerCase().includes(v.nom.toLowerCase()));
              return (
                <View key={i} style={styles.vaccRow}>
                  <Ionicons name={fait ? "checkmark-circle" : "ellipse-outline"} size={20} color={fait ? "#22C55E" : COLORS.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vaccNom}>{v.nom}</Text>
                    <Text style={styles.vaccQuand}>{v.quand}</Text>
                  </View>
                  {!fait && (
                    <TouchableOpacity onPress={() => { setText(`Vaccin ${v.nom}`); setShowAdd(true); }} style={styles.vaccBtn}>
                      <Text style={styles.vaccBtnText}>Marquer fait</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Entries list */}
        <View style={styles.entriesHead}>
          <Text style={styles.sectionTitle}>Mes entrées</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)} style={[styles.addBtn, { backgroundColor: meta.color[0] }]} testID="add-entry-btn">
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={meta.color[0]} style={{ marginTop: 20 }} /> :
          entries.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{meta.emoji}</Text>
              <Text style={styles.emptyText}>Aucune entrée pour le moment.</Text>
              <Text style={styles.emptySub}>Cliquez sur "Ajouter" pour commencer le suivi.</Text>
            </View>
          ) : entries.map((e) => (
            <View key={e.id} style={styles.entryCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryDate}>{new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</Text>
                {meta.field === "value" ? (
                  <Text style={[styles.entryValue, { color: meta.color[0] }]}>
                    {e.value} {t === "tension" && e.value2 ? `/${e.value2}` : meta.unit || ""}
                  </Text>
                ) : (
                  <Text style={styles.entryText}>{e.text}</Text>
                )}
                {e.notes && <Text style={styles.entryNotes}>📝 {e.notes}</Text>}
              </View>
              <TouchableOpacity onPress={() => remove(e.id)} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))
        }
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nouvelle entrée — {meta.emoji}</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}><Ionicons name="close" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>Date</Text>
            <DateField value={date} onChange={setDate} maximumDate={new Date()} placeholder="Date" />

            {meta.field === "value" ? (
              <>
                <Text style={styles.label}>Valeur {meta.unit ? `(${meta.unit})` : ""}</Text>
                <TextInput style={styles.input} value={val1} onChangeText={setVal1} keyboardType="decimal-pad" placeholder={meta.placeholder} placeholderTextColor={COLORS.textMuted} testID="val1-input" />
                {t === "tension" && (
                  <>
                    <Text style={styles.label}>Tension diastolique (optionnel)</Text>
                    <TextInput style={styles.input} value={val2} onChangeText={setVal2} keyboardType="decimal-pad" placeholder="Ex: 8.0" placeholderTextColor={COLORS.textMuted} testID="val2-input" />
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>{t === "vaccin" ? "Nom du vaccin" : t === "symptome" ? "Symptôme" : "Texte du journal"}</Text>
                <TextInput
                  style={[styles.input, t === "journal" && { minHeight: 100, textAlignVertical: "top" }]}
                  value={text}
                  onChangeText={setText}
                  placeholder={meta.placeholder}
                  placeholderTextColor={COLORS.textMuted}
                  multiline={t === "journal"}
                  testID="text-input"
                />
              </>
            )}

            <Text style={styles.label}>Notes (optionnel)</Text>
            <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]} value={notes} onChangeText={setNotes} multiline placeholder="Notes additionnelles..." placeholderTextColor={COLORS.textMuted} testID="notes-input" />

            <TouchableOpacity onPress={() => submit()} disabled={submitting} style={[styles.btn, { backgroundColor: meta.color[0] }]} testID="submit-entry">
              {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
              <Text style={styles.btnText}>{submitting ? "Enregistrement..." : "Enregistrer"}</Text>
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
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  helpBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#DBEAFE", borderRadius: RADIUS.md, marginBottom: 14, borderWidth: 1, borderColor: "#93C5FD" },
  helpText: { flex: 1, color: "#1E3A8A", fontSize: 12, lineHeight: 16 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginBottom: 10 },
  vaccBox: { backgroundColor: COLORS.surface, padding: 14, borderRadius: RADIUS.lg, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  vaccRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  vaccNom: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13 },
  vaccQuand: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  vaccBtn: { backgroundColor: "#22C55E", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  vaccBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  entriesHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: COLORS.textPrimary, fontWeight: "700", marginTop: 8 },
  emptySub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  entryCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  entryDate: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "700" },
  entryValue: { fontWeight: "800", fontSize: 22, marginTop: 4 },
  entryText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600", marginTop: 4 },
  entryNotes: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  delBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF2F2" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, paddingBottom: 40 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  label: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999, marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
