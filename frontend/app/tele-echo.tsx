import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { pickImageBase64, takePhotoBase64 } from "../lib/imagePicker";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function TeleEcho() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [rdvs, setRdvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    rdv_id: "", image_base64: "", description: "", semaine_grossesse: "",
    // Rapport structuré
    bpd_mm: "", fl_mm: "", cc_mm: "", ca_mm: "", poids_estime_g: "",
    liquide_amniotique: "", placenta_position: "", sexe_foetal: "",
    battements_cardiaques_bpm: "", conclusion: "",
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [showStructured, setShowStructured] = useState(false);

  const load = async () => {
    try {
      const [e, r] = await Promise.all([
        api.get("/tele-echo"),
        user?.role === "professionnel" ? api.get("/rdv") : Promise.resolve({ data: [] }),
      ]);
      setList(e.data);
      setRdvs(r.data.filter((x: any) => ["confirme", "termine"].includes(x.status)));
    } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  const pickImage = async (fromCam: boolean) => {
    const b64 = fromCam ? await takePhotoBase64() : await pickImageBase64();
    if (b64) setForm((f) => ({ ...f, image_base64: b64 }));
  };

  const upload = async () => {
    if (!form.rdv_id) return Alert.alert("RDV requis");
    const hasReport = form.bpd_mm || form.fl_mm || form.poids_estime_g || form.conclusion;
    if (!form.image_base64 && !hasReport && !form.description) {
      return Alert.alert("Image, rapport ou description requis", "Renseignez au moins une image, un rapport structuré ou une description");
    }
    try {
      await api.post("/tele-echo", {
        rdv_id: form.rdv_id,
        image_base64: form.image_base64 || undefined,
        description: form.description || undefined,
        semaine_grossesse: form.semaine_grossesse ? parseInt(form.semaine_grossesse) : undefined,
        // Rapport structuré (envoi uniquement si rempli)
        bpd_mm: form.bpd_mm ? parseFloat(form.bpd_mm) : undefined,
        fl_mm: form.fl_mm ? parseFloat(form.fl_mm) : undefined,
        cc_mm: form.cc_mm ? parseFloat(form.cc_mm) : undefined,
        ca_mm: form.ca_mm ? parseFloat(form.ca_mm) : undefined,
        poids_estime_g: form.poids_estime_g ? parseInt(form.poids_estime_g) : undefined,
        liquide_amniotique: form.liquide_amniotique || undefined,
        placenta_position: form.placenta_position || undefined,
        sexe_foetal: form.sexe_foetal || undefined,
        battements_cardiaques_bpm: form.battements_cardiaques_bpm ? parseInt(form.battements_cardiaques_bpm) : undefined,
        conclusion: form.conclusion || undefined,
      });
      setForm({
        rdv_id: "", image_base64: "", description: "", semaine_grossesse: "",
        bpd_mm: "", fl_mm: "", cc_mm: "", ca_mm: "", poids_estime_g: "",
        liquide_amniotique: "", placenta_position: "", sexe_foetal: "",
        battements_cardiaques_bpm: "", conclusion: "",
      });
      setShowStructured(false);
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Télé-échographie</Text>
        {user?.role === "professionnel" && (
          <TouchableOpacity style={styles.add} onPress={() => setModal(true)} testID="add-echo-btn">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {user?.role !== "professionnel" && <View style={{ width: 40 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="image-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune image</Text>
            <Text style={styles.emptyText}>
              {user?.role === "professionnel" ? "Ajoutez une image d'échographie pour une patiente" : "Vos examens apparaîtront ici"}
            </Text>
          </View>
        ) : list.map((e) => (
          <View key={e.id} style={styles.card}>
            {e.image_base64 && (
              <TouchableOpacity onPress={() => setPreview(e.image_base64)}>
                <Image source={{ uri: e.image_base64 }} style={styles.echoImg} resizeMode="cover" />
              </TouchableOpacity>
            )}
            <View style={{ padding: SPACING.md }}>
              <Text style={styles.cardTitle}>Semaine {e.semaine_grossesse || "?"}</Text>
              <Text style={styles.cardSub}>{e.pro_name} · {new Date(e.created_at).toLocaleDateString("fr-FR")}</Text>
              {e.description && <Text style={styles.cardDesc}>{e.description}</Text>}
              {/* Rapport structuré */}
              {(e.bpd_mm || e.fl_mm || e.poids_estime_g || e.conclusion) && (
                <View style={styles.reportBox}>
                  <Text style={styles.reportTitle}>📋 Rapport structuré</Text>
                  <View style={styles.reportGrid}>
                    {e.bpd_mm && <ReportItem label="BPD" value={`${e.bpd_mm} mm`} />}
                    {e.fl_mm && <ReportItem label="FL" value={`${e.fl_mm} mm`} />}
                    {e.cc_mm && <ReportItem label="CC" value={`${e.cc_mm} mm`} />}
                    {e.ca_mm && <ReportItem label="CA" value={`${e.ca_mm} mm`} />}
                    {e.poids_estime_g && <ReportItem label="Poids estimé" value={`${e.poids_estime_g} g`} />}
                    {e.battements_cardiaques_bpm && <ReportItem label="BCF" value={`${e.battements_cardiaques_bpm} bpm`} />}
                    {e.liquide_amniotique && <ReportItem label="Liquide" value={e.liquide_amniotique} />}
                    {e.placenta_position && <ReportItem label="Placenta" value={e.placenta_position} />}
                    {e.sexe_foetal && <ReportItem label="Sexe" value={e.sexe_foetal === "F" ? "👧 F" : e.sexe_foetal === "M" ? "👦 M" : "Indéterminé"} />}
                  </View>
                  {e.conclusion && (
                    <View style={styles.conclBox}>
                      <Text style={styles.conclLabel}>Conclusion médicale</Text>
                      <Text style={styles.conclText}>{e.conclusion}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Upload modal (pro) */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouvelle image</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>

              <Text style={styles.label}>RDV patiente</Text>
              {rdvs.length === 0 ? (
                <Text style={styles.empty}>Aucun RDV confirmé disponible</Text>
              ) : rdvs.map((r) => (
                <TouchableOpacity key={r.id} style={[styles.rdvRow, form.rdv_id === r.id && styles.rdvRowActive]} onPress={() => setForm({ ...form, rdv_id: r.id })}>
                  <Text style={styles.rdvName}>{r.maman_name}</Text>
                  <Text style={styles.rdvDate}>{new Date(r.date).toLocaleDateString("fr-FR")}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Image</Text>
              {form.image_base64 ? (
                <Image source={{ uri: form.image_base64 }} style={styles.previewImg} />
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage(false)} testID="echo-pick">
                  <Ionicons name="image" size={18} color={COLORS.primary} />
                  <Text style={styles.pickText}>Galerie</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage(true)} testID="echo-camera">
                  <Ionicons name="camera" size={18} color={COLORS.primary} />
                  <Text style={styles.pickText}>Caméra</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Semaine de grossesse</Text>
              <TextInput style={styles.input} value={form.semaine_grossesse} onChangeText={(v) => setForm({ ...form, semaine_grossesse: v })} keyboardType="number-pad" placeholder="ex: 22" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.label}>Description / Commentaires libres</Text>
              <TextInput style={[styles.input, { height: 80 }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Observations cliniques..." placeholderTextColor={COLORS.textMuted} />

              <TouchableOpacity style={styles.toggleStructured} onPress={() => setShowStructured((v) => !v)}>
                <Ionicons name={showStructured ? "chevron-up" : "chevron-down"} size={18} color={COLORS.primary} />
                <Text style={styles.toggleStructuredText}>Rapport structuré {showStructured ? "(masquer)" : "(recommandé)"}</Text>
              </TouchableOpacity>

              {showStructured && (
                <View style={styles.structuredBox}>
                  <Text style={styles.structLabel}>Biométrie fœtale</Text>
                  <View style={styles.structRow}>
                    <View style={styles.structHalf}>
                      <Text style={styles.subLabel}>BPD — Diamètre bipariétal (mm)</Text>
                      <TextInput style={styles.inputSm} value={form.bpd_mm} onChangeText={(v) => setForm({ ...form, bpd_mm: v })} keyboardType="decimal-pad" placeholder="ex: 55.2" placeholderTextColor={COLORS.textMuted} />
                    </View>
                    <View style={styles.structHalf}>
                      <Text style={styles.subLabel}>FL — Longueur fémorale (mm)</Text>
                      <TextInput style={styles.inputSm} value={form.fl_mm} onChangeText={(v) => setForm({ ...form, fl_mm: v })} keyboardType="decimal-pad" placeholder="ex: 42.1" placeholderTextColor={COLORS.textMuted} />
                    </View>
                  </View>
                  <View style={styles.structRow}>
                    <View style={styles.structHalf}>
                      <Text style={styles.subLabel}>CC — Circonf. crânienne (mm)</Text>
                      <TextInput style={styles.inputSm} value={form.cc_mm} onChangeText={(v) => setForm({ ...form, cc_mm: v })} keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
                    </View>
                    <View style={styles.structHalf}>
                      <Text style={styles.subLabel}>CA — Circonf. abdominale (mm)</Text>
                      <TextInput style={styles.inputSm} value={form.ca_mm} onChangeText={(v) => setForm({ ...form, ca_mm: v })} keyboardType="decimal-pad" placeholderTextColor={COLORS.textMuted} />
                    </View>
                  </View>
                  <Text style={styles.subLabel}>Poids estimé (g)</Text>
                  <TextInput style={styles.inputSm} value={form.poids_estime_g} onChangeText={(v) => setForm({ ...form, poids_estime_g: v })} keyboardType="number-pad" placeholder="ex: 1850" placeholderTextColor={COLORS.textMuted} />
                  <Text style={styles.subLabel}>Battements cardiaques (bpm)</Text>
                  <TextInput style={styles.inputSm} value={form.battements_cardiaques_bpm} onChangeText={(v) => setForm({ ...form, battements_cardiaques_bpm: v })} keyboardType="number-pad" placeholder="ex: 145" placeholderTextColor={COLORS.textMuted} />

                  <Text style={styles.structLabel}>Contexte utérin</Text>
                  <Text style={styles.subLabel}>Liquide amniotique</Text>
                  <View style={styles.chipRow}>
                    {["normal", "oligoamnios", "hydramnios"].map((o) => (
                      <TouchableOpacity key={o} style={[styles.chip, form.liquide_amniotique === o && styles.chipActive]} onPress={() => setForm({ ...form, liquide_amniotique: form.liquide_amniotique === o ? "" : o })}>
                        <Text style={[styles.chipText, form.liquide_amniotique === o && { color: "#fff" }]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.subLabel}>Position placenta</Text>
                  <View style={styles.chipRow}>
                    {["anterieur", "posterieur", "fundique", "praevia"].map((o) => (
                      <TouchableOpacity key={o} style={[styles.chip, form.placenta_position === o && styles.chipActive]} onPress={() => setForm({ ...form, placenta_position: form.placenta_position === o ? "" : o })}>
                        <Text style={[styles.chipText, form.placenta_position === o && { color: "#fff" }]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.subLabel}>Sexe fœtal</Text>
                  <View style={styles.chipRow}>
                    {[{ v: "F", l: "👧 Fille" }, { v: "M", l: "👦 Garçon" }, { v: "indetermine", l: "Indéterminé" }].map((o) => (
                      <TouchableOpacity key={o.v} style={[styles.chip, form.sexe_foetal === o.v && styles.chipActive]} onPress={() => setForm({ ...form, sexe_foetal: form.sexe_foetal === o.v ? "" : o.v })}>
                        <Text style={[styles.chipText, form.sexe_foetal === o.v && { color: "#fff" }]}>{o.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.structLabel}>Conclusion</Text>
                  <TextInput style={[styles.input, { height: 70 }]} multiline value={form.conclusion} onChangeText={(v) => setForm({ ...form, conclusion: v })} placeholder="Grossesse évolutive normale..." placeholderTextColor={COLORS.textMuted} />
                </View>
              )}

              <TouchableOpacity style={styles.btnPrimary} onPress={upload} testID="save-echo-btn">
                <Text style={styles.btnPrimaryText}>Partager avec la maman</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Preview modal */}
      <Modal visible={!!preview} animationType="fade" transparent>
        <TouchableOpacity style={styles.previewModal} activeOpacity={1} onPress={() => setPreview(null)}>
          {preview && <Image source={{ uri: preview }} style={styles.previewFull} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 30 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 10 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  echoImg: { width: "100%", height: 200, backgroundColor: "#000" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  cardSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cardDesc: { color: COLORS.textPrimary, marginTop: 6, fontStyle: "italic" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "95%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 12, marginBottom: 6 },
  rdvRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  rdvRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  rdvName: { fontWeight: "700", color: COLORS.textPrimary },
  rdvDate: { color: COLORS.textSecondary, fontSize: 12 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  previewImg: { width: "100%", height: 200, borderRadius: RADIUS.md, marginBottom: 8 },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md },
  pickText: { color: COLORS.primary, fontWeight: "700" },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  previewModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  previewFull: { width: "100%", height: "90%" },
  // Rapport structuré
  toggleStructured: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, marginTop: 12, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, alignSelf: "flex-start" },
  toggleStructuredText: { color: COLORS.primary, fontWeight: "800", fontSize: 13 },
  structuredBox: { marginTop: 10, padding: 12, backgroundColor: "#F0F9FF", borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#BAE6FD" },
  structLabel: { fontSize: 13, fontWeight: "800", color: COLORS.primary, marginTop: 10, marginBottom: 6 },
  subLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary, marginTop: 6, marginBottom: 4 },
  structRow: { flexDirection: "row", gap: 8 },
  structHalf: { flex: 1 },
  inputSm: { backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, padding: 8, fontSize: 13, color: COLORS.textPrimary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },
  // Vue rapport (lecture)
  reportBox: { marginTop: 10, padding: 10, backgroundColor: "#F9FAFB", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  reportTitle: { fontSize: 12, fontWeight: "800", color: COLORS.primary, marginBottom: 8 },
  reportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  conclBox: { marginTop: 10, padding: 8, backgroundColor: "#FEF3C7", borderRadius: 6, borderLeftWidth: 3, borderLeftColor: "#F59E0B" },
  conclLabel: { fontSize: 10, fontWeight: "800", color: "#92400E", marginBottom: 2 },
  conclText: { fontSize: 12, color: "#78350F", fontStyle: "italic" },
});

function ReportItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 90, marginRight: 8, marginBottom: 4 }}>
      <Text style={{ fontSize: 9, fontWeight: "800", color: COLORS.textMuted, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.textPrimary }}>{value}</Text>
    </View>
  );
}
