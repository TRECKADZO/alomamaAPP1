/**
 * Pro — Liste des demandes à domicile ouvertes, avec modal pour proposer un tarif.
 */
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";

export default function ProHomeRequests() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [suggest, setSuggest] = useState<any | null>(null);
  const [c, setC] = useState("");
  const [d, setD] = useState("");
  const [mn, setMn] = useState("");
  const [mw, setMw] = useState("");
  const [mu, setMu] = useState("");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/home-request/open");
      setItems(r.data || []);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openModal = async (req: any) => {
    setSelected(req);
    try {
      const s = await api.get(`/home-request/${req.id}/suggest`);
      setSuggest(s.data);
      setC(String(s.data.tarif_consultation));
      setD(String(s.data.frais_deplacement));
      setMn(String(s.data.majoration_nuit));
      setMw(String(s.data.majoration_we));
      setMu(String(s.data.majoration_urgence));
      setMsg("");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const total = (parseInt(c) || 0) + (parseInt(d) || 0) + (parseInt(mn) || 0) + (parseInt(mw) || 0) + (parseInt(mu) || 0);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/home-request/${selected.id}/propose`, {
        tarif_consultation: parseInt(c) || 0,
        frais_deplacement: parseInt(d) || 0,
        majoration_nuit: parseInt(mn) || 0,
        majoration_we: parseInt(mw) || 0,
        majoration_urgence: parseInt(mu) || 0,
        message: msg.trim() || undefined,
      });
      Alert.alert("✅ Proposition envoyée", `Total ${total.toLocaleString()} F. La maman recevra une notification.`);
      setSelected(null);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Demandes à domicile</Text>
        <TouchableOpacity onPress={() => router.push("/pro/pricing-domicile")} style={{ padding: 8 }}>
          <Ionicons name="settings" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTxt}>Aucune demande ouverte.</Text>
            <Text style={styles.emptySub}>Activez le mode domicile et configurez vos tarifs pour recevoir des demandes.</Text>
            <TouchableOpacity style={styles.cfgBtn} onPress={() => router.push("/pro/pricing-domicile")}>
              <Text style={styles.cfgTxt}>Configurer mes tarifs</Text>
            </TouchableOpacity>
          </View>
        )}
        {items.map((it) => {
          const isUrg = it.type === "urgence";
          const c2 = isUrg ? "#DC2626" : "#F59E0B";
          return (
            <View key={it.id} style={styles.card}>
              <View style={[styles.badge, { backgroundColor: c2 }]}>
                <Text style={styles.badgeTxt}>{isUrg ? "🆘 URGENCE" : "🏠 DOMICILE"}</Text>
              </View>
              <Text style={styles.motif}>{it.motif}</Text>
              <Text style={styles.meta}>{it.maman_label} · Zone {it.zone} · {it.ville || "CI"}</Text>
              {it.notes && <Text style={styles.notes}>📝 {it.notes}</Text>}
              {it.has_my_proposal ? (
                <View style={styles.alreadyBox}><Ionicons name="checkmark-circle" size={16} color="#10B981" /><Text style={styles.alreadyTxt}>Vous avez déjà proposé un tarif</Text></View>
              ) : (
                <TouchableOpacity style={[styles.proposeBtn, { backgroundColor: c2 }]} onPress={() => openModal(it)}>
                  <Ionicons name="pricetag" size={16} color="#fff" />
                  <Text style={styles.proposeTxt}>Proposer un tarif</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>💰 Proposer un tarif</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><Ionicons name="close" size={22} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {suggest?.auto_flags && (
                <View style={styles.flagsBox}>
                  <Text style={styles.flagsHint}>Suggestion auto basée sur vos tarifs configurés et la demande :</Text>
                  {suggest.auto_flags.nuit && <Text style={styles.flagItem}>🌙 Nuit (20h-7h) détectée</Text>}
                  {suggest.auto_flags.we && <Text style={styles.flagItem}>📅 Week-end détecté</Text>}
                  {suggest.auto_flags.urgence && <Text style={styles.flagItem}>🆘 Urgence détectée</Text>}
                </View>
              )}
              <Field label="Consultation (F CFA)" value={c} onChange={setC} />
              <Field label="Déplacement (F CFA)" value={d} onChange={setD} />
              <Field label="Majoration nuit" value={mn} onChange={setMn} />
              <Field label="Majoration week-end" value={mw} onChange={setMw} />
              <Field label="Majoration urgence" value={mu} onChange={setMu} />
              <Text style={styles.label}>Message (optionnel)</Text>
              <TextInput style={[styles.input, { minHeight: 60 }]} value={msg} onChangeText={setMsg} placeholder="Ex: Je peux être chez vous dans 30 min" multiline placeholderTextColor={COLORS.textMuted} />
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Total proposé</Text>
                <Text style={styles.totalValue}>{total.toLocaleString()} F CFA</Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
              <Text style={styles.submitTxt}>{submitting ? "Envoi..." : "Envoyer la proposition"}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholderTextColor={COLORS.textMuted} />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 10 },
  empty: { padding: 24, alignItems: "center", gap: 8 },
  emptyTxt: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  emptySub: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },
  cfgBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, marginTop: 8 },
  cfgTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, ...SHADOW },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 6 },
  badgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
  motif: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  notes: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontStyle: "italic" },
  alreadyBox: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, padding: 8, backgroundColor: "#D1FAE5", borderRadius: 6 },
  alreadyTxt: { color: "#065F46", fontSize: 12, fontWeight: "700" },
  proposeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 10, borderRadius: RADIUS.md, gap: 6, marginTop: 8 },
  proposeTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 6 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  flagsBox: { backgroundColor: "#EFF6FF", padding: 10, borderRadius: 8, marginBottom: 8 },
  flagsHint: { fontSize: 11, color: "#1D4ED8", marginBottom: 4 },
  flagItem: { fontSize: 12, color: "#1E3A8A", marginVertical: 1 },
  label: { fontSize: 12, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 8, fontSize: 13, color: COLORS.textPrimary },
  totalBox: { marginTop: 12, padding: 12, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: "#fff", fontSize: 13, fontWeight: "700" },
  totalValue: { color: "#fff", fontSize: 18, fontWeight: "900" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: RADIUS.md, gap: 8, backgroundColor: COLORS.success, marginTop: 8 },
  submitTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
