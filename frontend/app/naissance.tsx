import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Naissance() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [enfants, setEnfants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({
    enfant_id: "", lieu_naissance: "", heure_naissance: "", poids_naissance_g: "",
    taille_naissance_cm: "", nom_pere: "", nom_mere: user?.name || "", profession_pere: "",
    profession_mere: "", medecin_accoucheur: "",
  });

  const load = async () => {
    try {
      const [n, e] = await Promise.all([
        api.get("/naissance"),
        user?.role === "maman" ? api.get("/enfants") : Promise.resolve({ data: [] }),
      ]);
      setList(n.data); setEnfants(e.data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [user]));

  const create = async () => {
    if (!form.enfant_id || !form.lieu_naissance || !form.heure_naissance || !form.nom_mere) {
      return Alert.alert("Champs requis", "Enfant, lieu, heure et nom de la mère sont obligatoires");
    }
    try {
      await api.post("/naissance", {
        ...form,
        poids_naissance_g: parseInt(form.poids_naissance_g) || 0,
        taille_naissance_cm: parseFloat(form.taille_naissance_cm) || 0,
      });
      setModal(false);
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const validate = async (nid: string) => {
    try { await api.patch(`/naissance/${nid}/validate`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Déclarations de naissance</Text>
        {user?.role === "maman" && (
          <TouchableOpacity style={styles.add} onPress={() => setModal(true)} testID="add-naiss-btn">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {user?.role !== "maman" && <View style={{ width: 40 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune déclaration</Text>
            <Text style={styles.emptyText}>
              {user?.role === "maman" ? "Déclarez officiellement la naissance de votre enfant" : "Les demandes de déclaration apparaîtront ici"}
            </Text>
          </View>
        ) : list.map((n) => (
          <View key={n.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.childEmoji}>{n.enfant_sexe === "F" ? "👧" : "👦"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{n.enfant_nom}</Text>
                <Text style={styles.cardSub}>Né(e) le {new Date(n.enfant_date_naissance).toLocaleDateString("fr-FR")} à {n.heure_naissance}</Text>
              </View>
              <StatusBadge status={n.status} />
            </View>
            <Detail icon="location" label="Lieu" value={n.lieu_naissance} />
            <Detail icon="scale" label="Poids" value={`${n.poids_naissance_g} g`} />
            <Detail icon="resize" label="Taille" value={`${n.taille_naissance_cm} cm`} />
            <Detail icon="woman" label="Mère" value={n.nom_mere} />
            {n.nom_pere && <Detail icon="man" label="Père" value={n.nom_pere} />}
            {n.medecin_accoucheur && <Detail icon="medical" label="Médecin" value={n.medecin_accoucheur} />}
            {n.numero_acte && <Detail icon="finger-print" label="N° d'acte" value={n.numero_acte} />}

            {user?.role === "admin" && n.status === "en_attente" && (
              <TouchableOpacity style={styles.validateBtn} onPress={() => validate(n.id)} testID={`validate-${n.id}`}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.validateText}>Valider l'acte de naissance</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Déclaration de naissance</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>

              <Text style={styles.label}>Enfant *</Text>
              {enfants.map((e) => (
                <TouchableOpacity key={e.id} style={[styles.enfRow, form.enfant_id === e.id && styles.enfRowActive]} onPress={() => setForm({ ...form, enfant_id: e.id })}>
                  <Text>{e.sexe === "F" ? "👧" : "👦"} {e.nom}</Text>
                </TouchableOpacity>
              ))}

              <Field label="Lieu de naissance *" value={form.lieu_naissance} onChange={(v) => setForm({ ...form, lieu_naissance: v })} placeholder="Hôpital / Maternité / Ville" />
              <Field label="Heure de naissance *" value={form.heure_naissance} onChange={(v) => setForm({ ...form, heure_naissance: v })} placeholder="14:30" />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Poids (g) *" value={form.poids_naissance_g} onChange={(v) => setForm({ ...form, poids_naissance_g: v })} placeholder="3200" keyboard="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Taille (cm) *" value={form.taille_naissance_cm} onChange={(v) => setForm({ ...form, taille_naissance_cm: v })} placeholder="50" keyboard="decimal-pad" />
                </View>
              </View>

              <Field label="Nom de la mère *" value={form.nom_mere} onChange={(v) => setForm({ ...form, nom_mere: v })} />
              <Field label="Profession de la mère" value={form.profession_mere} onChange={(v) => setForm({ ...form, profession_mere: v })} />
              <Field label="Nom du père" value={form.nom_pere} onChange={(v) => setForm({ ...form, nom_pere: v })} />
              <Field label="Profession du père" value={form.profession_pere} onChange={(v) => setForm({ ...form, profession_pere: v })} />
              <Field label="Médecin accoucheur" value={form.medecin_accoucheur} onChange={(v) => setForm({ ...form, medecin_accoucheur: v })} />

              <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-naiss-btn">
                <Text style={styles.btnPrimaryText}>Déposer la déclaration</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: any = { en_attente: { bg: "#FFF3E0", fg: "#E88C00", label: "En attente" }, validee: { bg: "#DCFCE7", fg: COLORS.success, label: "Validée ✓" } };
  const c = map[status] || map.en_attente;
  return <Text style={[styles.statusBadge, { backgroundColor: c.bg, color: c.fg }]}>{c.label}</Text>;
}

function Detail({ icon, label, value }: any) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={15} color={COLORS.textSecondary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboard }: any) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={COLORS.textMuted} keyboardType={keyboard || "default"} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 19, fontWeight: "800", color: COLORS.textPrimary },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 10 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, paddingHorizontal: 20 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  childEmoji: { fontSize: 32 },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  cardSub: { color: COLORS.textSecondary, fontSize: 12 },
  statusBadge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, alignSelf: "flex-start" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  detailLabel: { color: COLORS.textSecondary, fontSize: 12, width: 80 },
  detailValue: { color: COLORS.textPrimary, fontWeight: "600", flex: 1, fontSize: 13 },
  validateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.success, paddingVertical: 12, borderRadius: RADIUS.pill, marginTop: 12 },
  validateText: { color: "#fff", fontWeight: "700" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "95%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  enfRow: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  enfRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
