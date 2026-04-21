import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";
import DateField from "../../../components/DateField";

export default function DossierPatient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"synthese" | "grossesse" | "enfants" | "rdvs" | "notes">("synthese");
  const [noteModal, setNoteModal] = useState(false);
  const [rappelModal, setRappelModal] = useState(false);
  const [note, setNote] = useState({ date: new Date().toISOString().slice(0, 10), diagnostic: "", traitement: "", notes: "" });
  const [rappel, setRappel] = useState({ title: "", due_at: new Date().toISOString().slice(0, 10), notes: "" });

  const load = async () => {
    try {
      const { data } = await api.get(`/pro/dossier/${id}`);
      setData(data);
    } catch (e) {
      Alert.alert("Accès refusé", formatError(e));
      router.back();
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [id]));

  const saveNote = async () => {
    if (!note.diagnostic && !note.notes) return Alert.alert("Champs", "Ajoutez au moins un diagnostic ou des notes");
    try {
      await api.post("/pro/consultation-notes", { patient_id: id, ...note });
      setNoteModal(false);
      setNote({ date: new Date().toISOString().slice(0, 10), diagnostic: "", traitement: "", notes: "" });
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const saveRappel = async () => {
    if (!rappel.title) return Alert.alert("Titre requis");
    try {
      await api.post("/pro/rappels-patient", { patient_id: id, ...rappel });
      setRappelModal(false);
      setRappel({ title: "", due_at: new Date().toISOString().slice(0, 10), notes: "" });
      Alert.alert("Succès", "Rappel envoyé à la patiente");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  const deleteNote = (noteId: string) => {
    Alert.alert("Supprimer ?", "", [
      { text: "Annuler" },
      { text: "Supprimer", style: "destructive", onPress: async () => { await api.delete(`/pro/consultation-notes/${noteId}`); load(); } },
    ]);
  };

  if (loading || !data) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const { patient, grossesse, enfants, rdvs, notes } = data;
  const weeksSA = grossesse?.date_debut ? Math.floor((Date.now() - new Date(grossesse.date_debut).getTime()) / (7 * 86400000)) : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header gradient cyan/teal */}
      <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.patientAvatar}>
          <Text style={styles.patientAvatarText}>{patient.name?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.patientName}>{patient.name}</Text>
          <Text style={styles.patientMeta}>{patient.email}</Text>
          <View style={styles.patientMetaRow}>
            {grossesse && <View style={styles.metaBadge}><Ionicons name="heart" size={10} color="#fff" /><Text style={styles.metaBadgeText}>{weeksSA} SA</Text></View>}
            {enfants.length > 0 && <View style={styles.metaBadge}><Ionicons name="happy" size={10} color="#fff" /><Text style={styles.metaBadgeText}>{enfants.length} enfant(s)</Text></View>}
          </View>
        </View>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/chat/${patient.id}?name=${encodeURIComponent(patient.name)}`)}>
          <Ionicons name="chatbubbles" size={18} color="#2DD4BF" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
        {[
          { id: "synthese", label: "Synthèse", icon: "analytics" },
          { id: "grossesse", label: "Grossesse", icon: "heart" },
          { id: "enfants", label: `Enfants (${enfants.length})`, icon: "happy" },
          { id: "rdvs", label: `RDV (${rdvs.length})`, icon: "calendar" },
          { id: "notes", label: `Notes (${notes.length})`, icon: "document-text" },
        ].map((t: any) => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabActive]}>
            <Ionicons name={t.icon} size={14} color={tab === t.id ? "#fff" : COLORS.textPrimary} />
            <Text style={[styles.tabText, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
        {tab === "synthese" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Informations patiente</Text>
              <InfoRow icon="mail" label="Email" value={patient.email} />
              {patient.phone && <InfoRow icon="call" label="Téléphone" value={patient.phone} />}
              <InfoRow icon="time" label="Membre depuis" value={patient.created_at ? new Date(patient.created_at).toLocaleDateString("fr-FR") : "-"} />
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { color: "#EC4899" }]}>{grossesse ? weeksSA : "-"}</Text>
                <Text style={styles.statLabel}>SA</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { color: "#3B82F6" }]}>{enfants.length}</Text>
                <Text style={styles.statLabel}>Enfants</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { color: "#A855F7" }]}>{rdvs.length}</Text>
                <Text style={styles.statLabel}>RDV</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { color: "#F59E0B" }]}>{notes.length}</Text>
                <Text style={styles.statLabel}>Notes</Text>
              </View>
            </View>
          </>
        )}

        {tab === "grossesse" && (
          grossesse ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Suivi de grossesse</Text>
              <InfoRow icon="calendar" label="Début" value={new Date(grossesse.date_debut).toLocaleDateString("fr-FR")} />
              {grossesse.date_terme && <InfoRow icon="flag" label="DPA" value={new Date(grossesse.date_terme).toLocaleDateString("fr-FR")} />}
              <InfoRow icon="pulse" label="Semaines SA" value={`${weeksSA} SA`} />
              {grossesse.groupe_sanguin && <InfoRow icon="water" label="Groupe sanguin" value={grossesse.groupe_sanguin} />}
              {grossesse.antecedents && <InfoRow icon="document" label="Antécédents" value={grossesse.antecedents} />}
            </View>
          ) : (
            <View style={styles.empty}><Ionicons name="heart-outline" size={40} color={COLORS.textMuted} /><Text style={styles.emptyText}>Aucune grossesse enregistrée</Text></View>
          )
        )}

        {tab === "enfants" && (
          enfants.length === 0 ? (
            <View style={styles.empty}><Ionicons name="happy-outline" size={40} color={COLORS.textMuted} /><Text style={styles.emptyText}>Aucun enfant enregistré</Text></View>
          ) : (
            enfants.map((e: any) => (
              <View key={e.id} style={styles.card}>
                <Text style={styles.cardTitle}>{e.nom}</Text>
                <Text style={{ color: COLORS.textSecondary }}>
                  {e.sexe === "F" ? "Fille" : "Garçon"} · Né(e) le {new Date(e.date_naissance).toLocaleDateString("fr-FR")}
                </Text>
                {e.groupe_sanguin && <Text style={{ marginTop: 6, color: COLORS.textSecondary }}>Groupe : {e.groupe_sanguin}</Text>}
                {e.allergies && e.allergies.length > 0 && <Text style={{ marginTop: 6, color: "#991B1B" }}>Allergies : {e.allergies.join(", ")}</Text>}
                <Text style={{ marginTop: 6, color: COLORS.primary, fontWeight: "700" }}>Vaccins : {(e.vaccins || []).length}</Text>
              </View>
            ))
          )
        )}

        {tab === "rdvs" && (
          rdvs.length === 0 ? (
            <View style={styles.empty}><Ionicons name="calendar-outline" size={40} color={COLORS.textMuted} /><Text style={styles.emptyText}>Aucun RDV</Text></View>
          ) : (
            rdvs.map((r: any) => (
              <View key={r.id} style={styles.rdvCard}>
                <View style={[styles.rdvIcon, { backgroundColor: r.statut === "confirme" ? "#DCFCE7" : "#FEF3C7" }]}>
                  <Ionicons name="medical" size={16} color={r.statut === "confirme" ? "#16A34A" : "#D97706"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rdvTitle}>{r.motif || "Consultation"}</Text>
                  <Text style={styles.rdvMeta}>{new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
                <Text style={[styles.rdvStatus, { color: r.statut === "confirme" ? "#16A34A" : "#D97706" }]}>{r.statut || "en_attente"}</Text>
              </View>
            ))
          )
        )}

        {tab === "notes" && (
          notes.length === 0 ? (
            <View style={styles.empty}><Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} /><Text style={styles.emptyText}>Aucune note de consultation</Text></View>
          ) : (
            notes.map((n: any) => (
              <View key={n.id} style={styles.card}>
                <View style={styles.noteHead}>
                  <Text style={styles.noteDate}>{new Date(n.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                  <TouchableOpacity onPress={() => deleteNote(n.id)}><Ionicons name="trash-outline" size={16} color={COLORS.error} /></TouchableOpacity>
                </View>
                {n.diagnostic && <Text style={styles.noteLabel}>DIAGNOSTIC</Text>}
                {n.diagnostic && <Text style={styles.noteContent}>{n.diagnostic}</Text>}
                {n.traitement && <Text style={styles.noteLabel}>TRAITEMENT</Text>}
                {n.traitement && <Text style={styles.noteContent}>{n.traitement}</Text>}
                {n.notes && <Text style={styles.noteLabel}>NOTES</Text>}
                {n.notes && <Text style={styles.noteContent}>{n.notes}</Text>}
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* FABs */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.fabSec} onPress={() => setRappelModal(true)}>
          <Ionicons name="alarm" size={20} color="#F59E0B" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setNoteModal(true)}>
          <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.fab}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.fabText}>Note de consultation</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Note modal */}
      <Modal visible={noteModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Note de consultation</Text>
                <TouchableOpacity onPress={() => setNoteModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Label text="Date" />
              <DateField value={note.date} onChange={(v) => setNote({ ...note, date: v })} placeholder="Choisir la date" />
              <Label text="Diagnostic" />
              <TextInput style={styles.input} value={note.diagnostic} onChangeText={(v) => setNote({ ...note, diagnostic: v })} placeholder="Diagnostic préliminaire..." placeholderTextColor={COLORS.textMuted} />
              <Label text="Traitement" />
              <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} multiline value={note.traitement} onChangeText={(v) => setNote({ ...note, traitement: v })} placeholder="Traitement prescrit, ordonnance..." placeholderTextColor={COLORS.textMuted} />
              <Label text="Notes complémentaires" />
              <TextInput style={[styles.input, { height: 100, textAlignVertical: "top" }]} multiline value={note.notes} onChangeText={(v) => setNote({ ...note, notes: v })} placeholder="Observations, recommandations..." placeholderTextColor={COLORS.textMuted} />
              <TouchableOpacity onPress={saveNote}>
                <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btnPrimary}>
                  <Text style={styles.btnPrimaryText}>Enregistrer la note</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Rappel modal */}
      <Modal visible={rappelModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Créer un rappel pour la patiente</Text>
              <TouchableOpacity onPress={() => setRappelModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Label text="Titre *" />
            <TextInput style={styles.input} value={rappel.title} onChangeText={(v) => setRappel({ ...rappel, title: v })} placeholder="Ex: Prise de médicament, RDV de suivi..." placeholderTextColor={COLORS.textMuted} />
            <Label text="Échéance" />
            <DateField value={rappel.due_at} onChange={(v) => setRappel({ ...rappel, due_at: v })} placeholder="Choisir la date" />
            <Label text="Notes" />
            <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} multiline value={rappel.notes} onChangeText={(v) => setRappel({ ...rappel, notes: v })} />
            <TouchableOpacity onPress={saveRappel}>
              <LinearGradient colors={["#F59E0B", "#EA580C"]} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Envoyer le rappel</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const Label = ({ text }: any) => <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 }}>{text}</Text>;
const InfoRow = ({ icon, label, value }: any) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border }}>
    <Ionicons name={icon} size={16} color={COLORS.textSecondary} />
    <Text style={{ color: COLORS.textSecondary, fontSize: 12, width: 100 }}>{label}</Text>
    <Text style={{ color: COLORS.textPrimary, fontWeight: "700", flex: 1, fontSize: 13 }}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingTop: SPACING.lg },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  patientAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.5)" },
  patientAvatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  patientName: { color: "#fff", fontWeight: "800", fontSize: 16 },
  patientMeta: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  patientMetaRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  metaBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  actionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },

  tabsScroll: { maxHeight: 48, backgroundColor: COLORS.bgPrimary, paddingVertical: 6 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  tabActive: { backgroundColor: "#06B6D4", borderColor: "#06B6D4" },
  tabText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, ...SHADOW },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginBottom: 6 },
  empty: { alignItems: "center", padding: 40, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyText: { color: COLORS.textSecondary, marginTop: 10 },

  statsRow: { flexDirection: "row", gap: 6 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  statVal: { fontWeight: "800", fontSize: 24 },
  statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

  rdvCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  rdvIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rdvTitle: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13 },
  rdvMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  rdvStatus: { fontWeight: "800", fontSize: 10, textTransform: "uppercase" },

  noteHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  noteDate: { fontWeight: "800", color: COLORS.primary, fontSize: 13 },
  noteLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: "800", letterSpacing: 1, marginTop: 8 },
  noteContent: { color: COLORS.textPrimary, fontSize: 13, marginTop: 3, lineHeight: 18 },

  fabRow: { position: "absolute", bottom: 20, left: 20, right: 20, flexDirection: "row", gap: 10, alignItems: "center" },
  fabSec: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", ...SHADOW },
  fab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 26, ...SHADOW },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, flex: 1 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary, fontSize: 14 },
  btnPrimary: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 18 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
