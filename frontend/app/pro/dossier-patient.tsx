/**
 * Écran Pro — Vue du dossier patient (maman ou enfant)
 * - Clic sur un enfant de la maman → affiche son dossier dynamique
 * - Affiche le dossier de grossesse en cours si la maman est enceinte
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

function ageOf(date_naissance?: string) {
  if (!date_naissance) return "";
  const m = Math.floor((Date.now() - new Date(date_naissance).getTime()) / (30.44 * 86400000));
  if (m < 12) return `${m} mois`;
  const a = Math.floor(m / 12); const r = m % 12;
  return r > 0 ? `${a} an${a > 1 ? "s" : ""} ${r} m` : `${a} an${a > 1 ? "s" : ""}`;
}

function semaineGrossesse(date_debut?: string) {
  if (!date_debut) return null;
  const days = Math.floor((Date.now() - new Date(date_debut).getTime()) / 86400000);
  const sa = Math.floor(days / 7);
  const j = days % 7;
  return `${sa} SA + ${j}j`;
}

export default function DossierPatient() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; type?: string; token?: string; nom?: string; via_parent?: string }>();
  const { id, token, nom } = params;
  const viaParent = params.via_parent;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) return;
    (async () => {
      try {
        const url = viaParent
          ? `/pro/patient/${id}/carnet?via_parent=${viaParent}`
          : `/pro/patient/${id}/carnet`;
        const r = await api.get(url, { headers: { "X-Access-Token": token } });
        setData(r.data);
      } catch (e: any) { setErr(formatError(e)); }
      finally { setLoading(false); }
    })();
  }, [id, token, viaParent]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (err) return (
    <SafeAreaView style={styles.loading}>
      <Ionicons name="close-circle" size={48} color="#EF4444" />
      <Text style={{ color: "#EF4444", fontWeight: "700", marginTop: 8, textAlign: "center" }}>{err}</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
        <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Retour</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const isEnfant = data?.type === "enfant";
  const subject = isEnfant ? data?.enfant : data?.maman;
  const enfants = data?.enfants || [];
  const grossesse = data?.grossesse;
  const rdvRecents = data?.rdv_recents || [];

  // Notes médicales associées à un enfant (charge auto)
  const [enfantNotes, setEnfantNotes] = useState<any[]>([]);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteDiag, setNoteDiag] = useState("");
  const [noteTrait, setNoteTrait] = useState("");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  // 📎 Pièce jointe à la note
  const [noteAttachment, setNoteAttachment] = useState<string | null>(null); // data URI complet
  const [noteAttachmentName, setNoteAttachmentName] = useState("");
  const [noteAttachmentMime, setNoteAttachmentMime] = useState("");

  const pickAttachment = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      let b64 = "";
      try {
        if (Platform.OS === "web") {
          const fr = await fetch(asset.uri);
          const blob = await fr.blob();
          b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        }
      } catch {
        Alert.alert("Erreur", "Impossible de lire le fichier.");
        return;
      }
      const sizeBytes = asset.size || Math.round((b64.length * 3) / 4);
      if (sizeBytes > 5 * 1024 * 1024) {
        Alert.alert("Fichier trop volumineux", "La taille maximale d'une pièce jointe est 5 Mo.");
        return;
      }
      const mime = asset.mimeType || (asset.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      setNoteAttachment(`data:${mime};base64,${b64}`);
      setNoteAttachmentName(asset.name || "document");
      setNoteAttachmentMime(mime);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const pickAttachmentPhoto = async () => {
    Alert.alert("Ajouter une photo", "Choisissez la source", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Appareil photo",
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) return Alert.alert("Permission refusée");
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
            if (r.canceled || !r.assets?.[0]?.base64) return;
            setNoteAttachment(`data:image/jpeg;base64,${r.assets[0].base64}`);
            setNoteAttachmentName(`photo_${Date.now()}.jpg`);
            setNoteAttachmentMime("image/jpeg");
          } catch (e) {
            Alert.alert("Erreur appareil photo", formatError(e));
          }
        },
      },
      {
        text: "Galerie",
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) return Alert.alert("Permission refusée");
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
            if (r.canceled || !r.assets?.[0]?.base64) return;
            setNoteAttachment(`data:image/jpeg;base64,${r.assets[0].base64}`);
            setNoteAttachmentName(`photo_${Date.now()}.jpg`);
            setNoteAttachmentMime("image/jpeg");
          } catch (e) {
            Alert.alert("Erreur galerie", formatError(e));
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (isEnfant && id) {
      api.get(`/enfants/${id}/consultation-notes`)
        .then((r) => setEnfantNotes(r.data || []))
        .catch(() => {});
    }
  }, [isEnfant, id]);

  const saveNote = async () => {
    if (!id) return;
    if (!noteDiag.trim() && !noteTrait.trim() && !noteText.trim()) {
      Alert.alert("Note vide", "Renseignez au moins un diagnostic, un traitement, ou une observation.");
      return;
    }
    setSavingNote(true);
    try {
      const r = await api.post("/pro/consultation-notes", {
        patient_id: id,
        diagnostic: noteDiag.trim() || undefined,
        traitement: noteTrait.trim() || undefined,
        notes: noteText.trim() || undefined,
        date: new Date().toISOString(),
        attachment_base64: noteAttachment || undefined,
        attachment_name: noteAttachmentName || undefined,
        attachment_mime: noteAttachmentMime || undefined,
      });
      setEnfantNotes((prev) => [r.data, ...prev]);
      setNoteDiag(""); setNoteTrait(""); setNoteText("");
      setNoteAttachment(null); setNoteAttachmentName(""); setNoteAttachmentMime("");
      setShowAddNote(false);
      Alert.alert("✓ Note ajoutée", "La note médicale a été enregistrée. La maman a été notifiée.");
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSavingNote(false);
    }
  };

  // Helper pour ouvrir le dossier d'un enfant en utilisant le même token
  const openChildFolder = (child: any) => {
    if (!id || !token) return;
    router.push({
      pathname: "/pro/dossier-patient",
      params: {
        id: child.id,
        type: "enfant",
        token: token,
        via_parent: id, // l'id de la maman
        nom: child.nom,
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dossier {isEnfant ? "Enfant" : "Patiente"}</Text>
          <Text style={styles.sub}>{subject?.nom || subject?.name || nom}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
        <LinearGradient colors={isEnfant ? ["#EC4899", "#F472B6"] : ["#3B82F6", "#06B6D4"]} style={styles.heroCard}>
          <View style={styles.heroIcon}><Text style={{ fontSize: 32 }}>{isEnfant ? "👶" : "👩"}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{subject?.nom || subject?.name}</Text>
            {isEnfant && <Text style={styles.heroMeta}>{ageOf(subject?.date_naissance)} · {subject?.sexe === "F" ? "Fille" : "Garçon"}</Text>}
            {subject?.groupe_sanguin && <Text style={styles.heroMeta}>🩸 Groupe sanguin : {subject.groupe_sanguin}</Text>}
            {subject?.numero_cmu && <Text style={styles.heroMeta}>🏥 CMU : {subject.numero_cmu}</Text>}
            {viaParent && <Text style={styles.heroMeta}>📋 Accès via le partage de la maman</Text>}
          </View>
        </LinearGradient>

        {data?.access_expires_at && (
          <View style={styles.accessInfo}>
            <Ionicons name="time" size={16} color="#F59E0B" />
            <Text style={styles.accessInfoText}>Accès valide jusqu'à {new Date(data.access_expires_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        )}

        {/* Allergies */}
        {subject?.allergies?.length > 0 && (
          <View style={styles.alertCard}>
            <Ionicons name="warning" size={20} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>⚠️ ALLERGIES</Text>
              <Text style={styles.alertText}>{Array.isArray(subject.allergies) ? subject.allergies.join(" · ") : subject.allergies}</Text>
            </View>
          </View>
        )}

        {/* 🤰 GROSSESSE EN COURS - visible uniquement pour la maman */}
        {!isEnfant && grossesse && (
          <View style={styles.grossesseCard}>
            <View style={styles.grossesseHeader}>
              <Text style={{ fontSize: 28 }}>🤰</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.grossesseTitle}>Grossesse en cours</Text>
                {grossesse.date_debut && (
                  <Text style={styles.grossesseSub}>
                    {semaineGrossesse(grossesse.date_debut)}
                    {grossesse.date_terme && ` · Terme prévu le ${new Date(grossesse.date_terme).toLocaleDateString("fr-FR")}`}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.grossesseGrid}>
              {grossesse.poids_initial && <Stat label="Poids initial" value={`${grossesse.poids_initial} kg`} />}
              {grossesse.taille && <Stat label="Taille" value={`${grossesse.taille} cm`} />}
              {grossesse.parite !== undefined && <Stat label="Parité" value={String(grossesse.parite)} />}
              {grossesse.gestite !== undefined && <Stat label="Gestité" value={String(grossesse.gestite)} />}
            </View>
            {grossesse.antecedents && (
              <View style={styles.grossesseRow}>
                <Text style={styles.grossesseLabel}>Antécédents :</Text>
                <Text style={styles.grossesseValue}>{grossesse.antecedents}</Text>
              </View>
            )}
            {grossesse.notes && (
              <View style={styles.grossesseRow}>
                <Text style={styles.grossesseLabel}>Notes :</Text>
                <Text style={styles.grossesseValue}>{grossesse.notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Infos de base */}
        <Text style={styles.sectionTitle}>Informations</Text>
        <View style={styles.card}>
          {subject?.date_naissance && <Row label="Né(e) le" value={new Date(subject.date_naissance).toLocaleDateString("fr-FR")} />}
          {subject?.lieu_naissance && <Row label="Lieu de naissance" value={subject.lieu_naissance} />}
          {subject?.poids_kg && <Row label="Poids" value={`${subject.poids_kg} kg`} />}
          {subject?.taille_cm && <Row label="Taille" value={`${subject.taille_cm} cm`} />}
          {subject?.ville && <Row label="Ville" value={subject.ville} />}
          {subject?.phone && <Row label="Téléphone" value={subject.phone} />}
          {subject?.email && <Row label="Email" value={subject.email} />}
        </View>

        {/* Vaccins pour enfant */}
        {isEnfant && subject?.vaccins?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>💉 Vaccins ({subject.vaccins.length})</Text>
            <View style={styles.card}>
              {subject.vaccins.map((v: any, i: number) => (
                <View key={i} style={styles.vaccinRow}>
                  <Text style={styles.vaccinName}>{v.nom}</Text>
                  <Text style={styles.vaccinDate}>{v.date ? new Date(v.date).toLocaleDateString("fr-FR") : "—"}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Mesures enfant */}
        {isEnfant && subject?.mesures?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>📏 Mesures ({subject.mesures.length})</Text>
            <View style={styles.card}>
              {subject.mesures.slice(-5).reverse().map((m: any, i: number) => (
                <View key={i} style={styles.measureRow}>
                  <Text style={styles.measureDate}>{m.date ? new Date(m.date).toLocaleDateString("fr-FR") : "—"}</Text>
                  <Text style={styles.measureVal}>{m.poids_kg ? `${m.poids_kg} kg` : ""} {m.taille_cm ? `· ${m.taille_cm} cm` : ""} {m.perimetre_cranien_cm ? `· PC ${m.perimetre_cranien_cm} cm` : ""}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* RDV récents avec ce pro */}
        {rdvRecents.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>📅 Vos RDV avec {isEnfant ? "cet enfant" : "cette patiente"} ({rdvRecents.length})</Text>
            <View style={styles.card}>
              {rdvRecents.slice(0, 5).map((r: any, i: number) => (
                <View key={i} style={styles.rdvRow}>
                  <Text style={styles.rdvDate}>{new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</Text>
                  <Text style={styles.rdvMotif} numberOfLines={1}>{r.motif || "Consultation"}</Text>
                  <Text style={[styles.rdvStatus, r.status === "confirme" ? styles.rdvOk : styles.rdvPending]}>{r.status === "confirme" ? "✓" : r.status === "annule" ? "✕" : "⏳"}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 📝 Notes médicales (visibles seulement pour les enfants) */}
        {isEnfant && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <Text style={[styles.sectionTitle, { marginTop: 0 }]}>📝 Notes médicales ({enfantNotes.length})</Text>
              <TouchableOpacity onPress={() => setShowAddNote(true)} style={styles.addNoteBtn}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addNoteBtnText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tip}>Vos notes sont chiffrées et visibles par la maman dans le carnet de l'enfant.</Text>
            {enfantNotes.length === 0 ? (
              <View style={[styles.card, { alignItems: "center", padding: 16 }]}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Aucune note pour le moment</Text>
              </View>
            ) : (
              enfantNotes.map((n: any) => (
                <View key={n.id} style={styles.noteCard}>
                  <Text style={styles.noteDate}>{new Date(n.date || n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</Text>
                  {n.diagnostic && <Row label="Diagnostic" value={n.diagnostic} />}
                  {n.traitement && <Row label="Traitement" value={n.traitement} />}
                  {n.notes && <Row label="Observations" value={n.notes} />}
                </View>
              ))
            )}
          </>
        )}

        {/* Enfants de la maman - cliquables ! */}
        {!isEnfant && enfants.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>👶 Enfants ({enfants.length})</Text>
            <Text style={styles.tip}>Touchez un enfant pour ouvrir son dossier complet</Text>
            {enfants.map((e: any) => (
              <TouchableOpacity
                key={e.id}
                style={styles.childCard}
                onPress={() => openChildFolder(e)}
                activeOpacity={0.6}
                testID={`child-${e.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.childName}>{e.nom}</Text>
                  <Text style={styles.childMeta}>{ageOf(e.date_naissance)} · {e.sexe === "F" ? "Fille" : "Garçon"}</Text>
                  {e.groupe_sanguin && <Text style={styles.childMeta}>🩸 {e.groupe_sanguin}</Text>}
                  {e.allergies && <Text style={[styles.childMeta, { color: "#B45309", fontWeight: "700" }]}>⚠️ Allergies : {Array.isArray(e.allergies) ? e.allergies.join(", ") : e.allergies}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* Modal Ajouter une note */}
      <Modal visible={showAddNote} animationType="slide" transparent onRequestClose={() => setShowAddNote(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrap} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
          <TouchableOpacity activeOpacity={1} style={{ flex: 1 }} onPress={() => setShowAddNote(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>📝 Nouvelle note médicale</Text>
              <TouchableOpacity onPress={() => setShowAddNote(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.formLabel}>Diagnostic</Text>
              <TextInput style={styles.formInput} value={noteDiag} onChangeText={setNoteDiag} placeholder="Ex : Bronchiolite légère" placeholderTextColor={COLORS.textMuted} returnKeyType="next" />
              <Text style={styles.formLabel}>Traitement / Prescription</Text>
              <TextInput style={[styles.formInput, { height: 70, textAlignVertical: "top" }]} multiline value={noteTrait} onChangeText={setNoteTrait} placeholder="Médicaments, posologie, durée…" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.formLabel}>Observations / Conseils</Text>
              <TextInput style={[styles.formInput, { height: 80, textAlignVertical: "top" }]} multiline value={noteText} onChangeText={setNoteText} placeholder="Conseils à la maman, suivi à prévoir…" placeholderTextColor={COLORS.textMuted} />

              {/* Pièce jointe */}
              <Text style={styles.formLabel}>Pièce jointe (optionnel)</Text>
              {noteAttachment ? (
                <View style={styles.attachmentCard}>
                  <Ionicons name="document-attach" size={18} color="#EC4899" />
                  <Text style={styles.attachmentName} numberOfLines={1}>{noteAttachmentName || "Fichier joint"}</Text>
                  <TouchableOpacity onPress={() => { setNoteAttachment(null); setNoteAttachmentName(""); setNoteAttachmentMime(""); }}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.attachBtn} onPress={pickAttachment}>
                    <Ionicons name="document-attach-outline" size={16} color="#EC4899" />
                    <Text style={styles.attachBtnText}>PDF/Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.attachBtn} onPress={pickAttachmentPhoto}>
                    <Ionicons name="camera-outline" size={16} color="#EC4899" />
                    <Text style={styles.attachBtnText}>Photo</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity onPress={saveNote} disabled={savingNote} style={{ marginTop: 16 }}>
                <LinearGradient colors={savingNote ? ["#94A3B8", "#94A3B8"] : ["#EC4899", "#F472B6"]} style={styles.saveNoteBtn}>
                  {savingNote ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="lock-closed" size={18} color="#fff" />
                      <Text style={styles.saveNoteText}>Enregistrer (chiffré)</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  heroCard: { flexDirection: "row", gap: 14, padding: 16, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 12 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  heroName: { color: "#fff", fontWeight: "800", fontSize: 18 },
  heroMeta: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 4, fontWeight: "600" },
  accessInfo: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", padding: 10, borderRadius: RADIUS.md, marginBottom: 12 },
  accessInfoText: { color: "#92400E", fontSize: 12, fontWeight: "700" },
  alertCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, backgroundColor: "#FEF3C7", borderWidth: 2, borderColor: "#F59E0B", borderRadius: RADIUS.md, marginBottom: 12 },
  alertTitle: { color: "#B45309", fontWeight: "800", fontSize: 12 },
  alertText: { color: "#92400E", fontSize: 13, marginTop: 4, lineHeight: 18 },

  // 🤰 Grossesse
  grossesseCard: { padding: 14, borderRadius: RADIUS.lg, backgroundColor: "#FCE7F3", borderWidth: 1, borderColor: "#F9A8D4", marginBottom: 14 },
  grossesseHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  grossesseTitle: { fontSize: 16, fontWeight: "800", color: "#9D174D" },
  grossesseSub: { fontSize: 12, color: "#BE185D", marginTop: 2, fontWeight: "600" },
  grossesseGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  grossesseRow: { marginTop: 8 },
  grossesseLabel: { fontSize: 11, color: "#9D174D", fontWeight: "700", textTransform: "uppercase" },
  grossesseValue: { fontSize: 13, color: "#831843", marginTop: 2, lineHeight: 18 },
  statBox: { flex: 1, minWidth: "45%", padding: 8, backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 8 },
  statLabel: { fontSize: 10, color: "#9D174D", fontWeight: "700", textTransform: "uppercase" },
  statValue: { fontSize: 14, color: "#831843", fontWeight: "800", marginTop: 2 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 6 },
  tip: { fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontStyle: "italic" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  rowValue: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700" },
  vaccinRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  vaccinName: { color: COLORS.textPrimary, fontWeight: "700" },
  vaccinDate: { color: COLORS.textSecondary, fontSize: 12 },
  measureRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  measureDate: { color: COLORS.textSecondary, fontSize: 12 },
  measureVal: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  rdvRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rdvDate: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700", width: 56 },
  rdvMotif: { flex: 1, fontSize: 13, color: COLORS.textPrimary, fontWeight: "600" },
  rdvStatus: { fontSize: 14, fontWeight: "800" },
  rdvOk: { color: "#10B981" },
  rdvPending: { color: "#F59E0B" },

  // Cartes enfant cliquables
  childCard: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  childName: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  childMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

  // 📝 Notes médicales
  addNoteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#EC4899", borderRadius: 999 },
  addNoteBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  noteCard: { padding: 12, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md, borderLeftWidth: 4, borderLeftColor: "#EC4899", borderWidth: 1, borderColor: "#FBCFE8", marginBottom: 8 },
  noteDate: { fontSize: 11, color: "#9D174D", fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },

  // Modal note
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  formLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "800", marginTop: 12, marginBottom: 6, textTransform: "uppercase" },
  formInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary },
  saveNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999 },
  saveNoteText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  // 📎 Attachment
  attachBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "#EC4899", backgroundColor: "#FCE7F3" },
  attachBtnText: { color: "#EC4899", fontWeight: "800", fontSize: 12 },
  attachmentCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "#FCE7F3", borderWidth: 1, borderColor: "#FBCFE8" },
  attachmentName: { flex: 1, fontSize: 13, color: "#9D174D", fontWeight: "600" },
});
