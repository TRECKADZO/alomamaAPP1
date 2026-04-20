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
  const [form, setForm] = useState({ rdv_id: "", image_base64: "", description: "", semaine_grossesse: "" });
  const [preview, setPreview] = useState<string | null>(null);

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
    if (!form.rdv_id || !form.image_base64) return Alert.alert("RDV et image requis");
    try {
      await api.post("/tele-echo", {
        rdv_id: form.rdv_id,
        image_base64: form.image_base64,
        description: form.description,
        semaine_grossesse: form.semaine_grossesse ? parseInt(form.semaine_grossesse) : undefined,
      });
      setForm({ rdv_id: "", image_base64: "", description: "", semaine_grossesse: "" });
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
            <TouchableOpacity onPress={() => setPreview(e.image_base64)}>
              <Image source={{ uri: e.image_base64 }} style={styles.echoImg} resizeMode="cover" />
            </TouchableOpacity>
            <View style={{ padding: SPACING.md }}>
              <Text style={styles.cardTitle}>Semaine {e.semaine_grossesse || "?"}</Text>
              <Text style={styles.cardSub}>{e.pro_name} · {new Date(e.created_at).toLocaleDateString("fr-FR")}</Text>
              {e.description && <Text style={styles.cardDesc}>{e.description}</Text>}
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

              <Text style={styles.label}>Description / Compte-rendu</Text>
              <TextInput style={[styles.input, { height: 80 }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Observations cliniques..." placeholderTextColor={COLORS.textMuted} />

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
});
