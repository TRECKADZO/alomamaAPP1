import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Linking, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { api, formatError } from "../lib/api";
import { smartPost } from "../lib/offline";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import DateField from "../components/DateField";

const LIEU_TYPES = [
  { id: "maternite", label: "Maternité / Hôpital", icon: "🏥" },
  { id: "pmi", label: "PMI / CSU", icon: "🏪" },
  { id: "domicile", label: "À domicile", icon: "🏠" },
  { id: "autre", label: "Autre lieu", icon: "📍" },
];

const MATERNITES_CI = [
  "CHU de Yopougon", "CHU de Cocody", "CHU de Treichville",
  "Maternité Yopougon-Attié", "Maternité de Port-Bouët",
  "PMI Adjamé", "PMI Abobo", "Polyclinique Internationale Sainte Anne-Marie",
  "Clinique Hôtel-Dieu", "Hôpital Général de Bouaké",
  "Maternité de Yamoussoukro", "Maternité de San Pedro", "Maternité de Korhogo",
];

export default function Naissance() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [enfants, setEnfants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1); // 1=enfant, 2=naissance, 3=parents, 4=récap+consent
  const [voiceOn, setVoiceOn] = useState(false);
  const [postCreateModal, setPostCreateModal] = useState<any | null>(null); // déclaration créée

  const initialForm = () => ({
    enfant_id: "",
    create_enfant: true,
    enfant_nom: "",
    prenoms: "",
    enfant_sexe: "F" as "F" | "M",
    enfant_date_naissance: new Date().toISOString().slice(0, 10),
    lieu_type: "maternite",
    lieu_naissance: "",
    heure_naissance: "08:00",
    poids_naissance_g: "",
    taille_naissance_cm: "",
    score_apgar_1min: "",
    score_apgar_5min: "",
    nom_pere: "",
    nom_mere: user?.name || "",
    profession_pere: "",
    profession_mere: "",
    medecin_accoucheur: "",
    consentement_explicite: false,
  });
  const [form, setForm] = useState<any>(initialForm());

  const speak = (txt: string) => {
    if (!voiceOn) return;
    Speech.stop();
    Speech.speak(txt, { language: "fr-FR", rate: 0.95 });
  };

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const [n, e] = await Promise.all([
        api.get("/naissance").catch(() => ({ data: [] })),
        user?.role === "maman" ? api.get("/enfants").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setList(n.data); setEnfants(e.data);
    } catch (err) {
      // Silently swallow — auth interceptor handles redirect
      console.warn("naissance load error", err);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [user?.id]));

  useEffect(() => () => { Speech.stop(); }, []);

  const openModal = (preselectEnfantId?: string) => {
    setForm({ ...initialForm(), enfant_id: preselectEnfantId || "", create_enfant: !preselectEnfantId });
    setStep(1);
    setModal(true);
    speak("Déclaration de naissance. Étape 1 sur 4. Identité de l'enfant.");
  };

  const next = () => {
    if (step === 1) {
      if (!form.create_enfant && !form.enfant_id) return Alert.alert("Sélection requise", "Choisissez un enfant existant ou créez le carnet.");
      if (form.create_enfant && (!form.enfant_nom || !form.enfant_date_naissance)) return Alert.alert("Champs requis", "Nom et date de naissance de l'enfant.");
    }
    if (step === 2) {
      if (!form.lieu_naissance || !form.heure_naissance) return Alert.alert("Champs requis", "Lieu et heure de naissance.");
    }
    if (step === 3) {
      if (!form.nom_mere) return Alert.alert("Champ requis", "Le nom de la mère est obligatoire.");
    }
    const newStep = step + 1;
    setStep(newStep);
    speak(["", "Identité de l'enfant.", "Lieu et heure de naissance.", "Informations sur les parents.", "Vérification et consentement."][newStep]);
  };

  const prev = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    if (!form.consentement_explicite) return Alert.alert("Consentement requis", "Veuillez confirmer votre consentement explicite.");
    const payload: any = {
      lieu_naissance: form.lieu_naissance,
      lieu_type: form.lieu_type,
      heure_naissance: form.heure_naissance,
      poids_naissance_g: parseInt(form.poids_naissance_g) || 0,
      taille_naissance_cm: parseFloat(form.taille_naissance_cm) || 0,
      score_apgar_1min: form.score_apgar_1min ? parseInt(form.score_apgar_1min) : null,
      score_apgar_5min: form.score_apgar_5min ? parseInt(form.score_apgar_5min) : null,
      nom_pere: form.nom_pere || undefined,
      nom_mere: form.nom_mere,
      profession_pere: form.profession_pere || undefined,
      profession_mere: form.profession_mere || undefined,
      medecin_accoucheur: form.medecin_accoucheur || undefined,
      prenoms: form.prenoms || undefined,
      consentement_explicite: true,
    };
    if (form.create_enfant) {
      payload.enfant_nom = form.enfant_nom;
      payload.enfant_sexe = form.enfant_sexe;
      payload.enfant_date_naissance = form.enfant_date_naissance;
    } else {
      payload.enfant_id = form.enfant_id;
    }
    try {
      const r = await smartPost("/naissance", payload);
      if (r.queued) {
        Alert.alert("Enregistré hors ligne", "La déclaration sera envoyée dès la reconnexion. Le PDF sera généré une fois en ligne.");
        setModal(false);
        load();
        return;
      }
      const created = r.data || r;
      setModal(false);
      setPostCreateModal(created);
      speak(`Déclaration enregistrée. Numéro de référence ${created.numero_reference}. Vous pouvez maintenant télécharger ou partager le document.`);
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const downloadPdf = async (nid: string, ref: string) => {
    try {
      speak("Génération du document en cours...");
      const r = await api.get(`/naissance/${nid}/pdf`);
      const { base64, filename } = r.data;
      if (Platform.OS === "web") {
        // Sur web : déclencher téléchargement
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${base64}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        speak("Téléchargement terminé.");
        return;
      }
      // Mobile : sauvegarder + partager
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: `Déclaration ${ref}` });
      } else {
        Alert.alert("✅ Enregistré", `Fichier sauvegardé : ${fileUri}`);
      }
      speak("Document prêt à être partagé.");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const sendEmail = async (nid: string, canal: "email_maman" | "email_etat_civil") => {
    try {
      const r = await api.post(`/naissance/${nid}/share`, { canal });
      Alert.alert(
        "Demande enregistrée 📨",
        `${r.data.message}\n\nDestinataire : ${r.data.destinataire}`
      );
      speak("Demande d'envoi enregistrée.");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Déclarations de naissance</Text>
        {user?.role === "maman" && (
          <TouchableOpacity style={styles.add} onPress={() => openModal()} testID="add-naiss-btn">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {user?.role !== "maman" && <View style={{ width: 40 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {user?.role === "maman" && (
          <TouchableOpacity style={styles.heroCta} onPress={() => openModal()} testID="hero-declarer-btn">
            <View style={styles.heroIcon}><Text style={{ fontSize: 38 }}>📄</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Déclarer une naissance</Text>
              <Text style={styles.heroSub}>Génère un PDF officiel pré-rempli à présenter à l'état civil</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune déclaration</Text>
            <Text style={styles.emptyText}>
              {user?.role === "maman" ? "Cliquez sur le bouton ci-dessus pour démarrer." : "Les demandes de déclaration apparaîtront ici."}
            </Text>
          </View>
        ) : list.map((n) => (
          <View key={n.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.childEmoji}>{n.enfant_sexe === "F" ? "👧" : "👦"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{n.enfant_nom}</Text>
                <Text style={styles.cardSub}>Né(e) le {new Date(n.enfant_date_naissance).toLocaleDateString("fr-FR")} à {n.heure_naissance}</Text>
                {n.numero_reference && <Text style={styles.refTxt}>Réf : {n.numero_reference}</Text>}
              </View>
              <StatusBadge status={n.status} />
            </View>
            <Detail icon="location" label="Lieu" value={n.lieu_naissance} />
            {!!n.poids_naissance_g && <Detail icon="scale" label="Poids" value={`${n.poids_naissance_g} g`} />}
            {!!n.taille_naissance_cm && <Detail icon="resize" label="Taille" value={`${n.taille_naissance_cm} cm`} />}
            {n.score_apgar_5min !== undefined && n.score_apgar_5min !== null && <Detail icon="ribbon" label="APGAR 5 min" value={`${n.score_apgar_5min} / 10`} />}
            <Detail icon="woman" label="Mère" value={n.nom_mere} />
            {n.nom_pere && <Detail icon="man" label="Père" value={n.nom_pere} />}

            {/* Actions PDF */}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => downloadPdf(n.id, n.numero_reference || n.id)} testID={`pdf-${n.id}`}>
                <Ionicons name="download" size={16} color={COLORS.primary} />
                <Text style={styles.actionTxt}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => sendEmail(n.id, "email_maman")} testID={`mail-${n.id}`}>
                <Ionicons name="mail" size={16} color={COLORS.primary} />
                <Text style={styles.actionTxt}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => sendEmail(n.id, "email_etat_civil")} testID={`etat-${n.id}`}>
                <Ionicons name="business" size={16} color={COLORS.primary} />
                <Text style={styles.actionTxt}>État civil</Text>
              </TouchableOpacity>
            </View>

            {user?.role === "admin" && n.status === "en_attente" && (
              <TouchableOpacity style={styles.validateBtn} onPress={async () => { try { await api.patch(`/naissance/${n.id}/validate`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); } }} testID={`validate-${n.id}`}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.validateText}>Valider l'acte</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {/* MODAL — formulaire en 4 étapes */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepHint}>Étape {step} / 4</Text>
                  <Text style={styles.modalTitle}>
                    {step === 1 && "👶 Identité de l'enfant"}
                    {step === 2 && "🏥 Naissance"}
                    {step === 3 && "👨‍👩 Parents"}
                    {step === 4 && "✅ Vérification"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setVoiceOn((v) => !v)} style={styles.voiceBtn} testID="voice-toggle">
                  <Ionicons name={voiceOn ? "volume-high" : "volume-mute"} size={20} color={voiceOn ? COLORS.primary : COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setModal(false)} testID="close-naiss-modal">
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.progressBar}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={[styles.progressDot, step >= i && styles.progressDotActive]} />
                ))}
              </View>

              {/* ÉTAPE 1 - Enfant */}
              {step === 1 && (
                <View>
                  {enfants.length > 0 && (
                    <View style={styles.modeSwitch}>
                      <TouchableOpacity style={[styles.modeBtn, !form.create_enfant && styles.modeBtnActive]} onPress={() => setForm({ ...form, create_enfant: false })}>
                        <Ionicons name="people" size={16} color={!form.create_enfant ? "#fff" : COLORS.textPrimary} />
                        <Text style={[styles.modeBtnText, !form.create_enfant && { color: "#fff" }]}>Enfant existant</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modeBtn, form.create_enfant && styles.modeBtnActive]} onPress={() => setForm({ ...form, create_enfant: true, enfant_id: "" })}>
                        <Ionicons name="add-circle" size={16} color={form.create_enfant ? "#fff" : COLORS.textPrimary} />
                        <Text style={[styles.modeBtnText, form.create_enfant && { color: "#fff" }]}>Nouveau bébé</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {!form.create_enfant ? (
                    <View>
                      <Text style={styles.label}>Sélectionner mon enfant</Text>
                      {enfants.map((e) => (
                        <TouchableOpacity key={e.id} style={[styles.enfRow, form.enfant_id === e.id && styles.enfRowActive]} onPress={() => setForm({ ...form, enfant_id: e.id })} testID={`pick-enfant-${e.id}`}>
                          <Text style={{ fontSize: 26 }}>{e.sexe === "F" ? "👧" : "👦"}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.enfName}>{e.nom}</Text>
                            <Text style={styles.enfDate}>Né(e) le {new Date(e.date_naissance).toLocaleDateString("fr-FR")}</Text>
                          </View>
                          {form.enfant_id === e.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View>
                      <BigField label="Nom de famille" icon="📛" value={form.enfant_nom} onChange={(v) => setForm({ ...form, enfant_nom: v })} placeholder="Ex: Kouamé" speak={speak} testID="enfant-nom" />
                      <BigField label="Prénom(s)" icon="✏️" value={form.prenoms} onChange={(v) => setForm({ ...form, prenoms: v })} placeholder="Ex: Adam Joseph" speak={speak} testID="enfant-prenoms" />

                      <Text style={styles.label}>👫 Sexe</Text>
                      <View style={styles.sexRow}>
                        {(["F", "M"] as const).map((s) => (
                          <TouchableOpacity key={s} style={[styles.sexBtn, form.enfant_sexe === s && styles.sexBtnActive]} onPress={() => { setForm({ ...form, enfant_sexe: s }); speak(s === "F" ? "Fille" : "Garçon"); }}>
                            <Text style={{ fontSize: 36 }}>{s === "F" ? "👧" : "👦"}</Text>
                            <Text style={[styles.sexLabel, form.enfant_sexe === s && { color: "#fff" }]}>{s === "F" ? "Fille" : "Garçon"}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.label}>📅 Date de naissance</Text>
                      <DateField value={form.enfant_date_naissance} onChange={(v) => setForm({ ...form, enfant_date_naissance: v })} maximumDate={new Date()} placeholder="Choisir la date" testID="enfant-dob" />
                    </View>
                  )}
                </View>
              )}

              {/* ÉTAPE 2 - Naissance */}
              {step === 2 && (
                <View>
                  <Text style={styles.label}>📍 Type de lieu</Text>
                  <View style={styles.lieuGrid}>
                    {LIEU_TYPES.map((l) => (
                      <TouchableOpacity key={l.id} style={[styles.lieuChip, form.lieu_type === l.id && styles.lieuChipActive]} onPress={() => { setForm({ ...form, lieu_type: l.id, lieu_naissance: l.id === "domicile" ? "Domicile" : "" }); speak(l.label); }} testID={`lieu-${l.id}`}>
                        <Text style={{ fontSize: 28 }}>{l.icon}</Text>
                        <Text style={[styles.lieuLabel, form.lieu_type === l.id && { color: "#fff" }]}>{l.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {(form.lieu_type === "maternite" || form.lieu_type === "pmi") && (
                    <View>
                      <Text style={styles.label}>🏥 Établissement</Text>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                        {MATERNITES_CI.map((m) => (
                          <TouchableOpacity key={m} style={[styles.suggestRow, form.lieu_naissance === m && styles.suggestRowActive]} onPress={() => setForm({ ...form, lieu_naissance: m })}>
                            <Text style={[styles.suggestText, form.lieu_naissance === m && { color: "#fff", fontWeight: "800" }]}>{m}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <BigField label="ou tapez le nom de l'établissement" icon="✍️" value={form.lieu_naissance} onChange={(v) => setForm({ ...form, lieu_naissance: v })} placeholder="Ex: Maternité de Daloa" speak={speak} testID="lieu-libre" />
                    </View>
                  )}
                  {form.lieu_type === "autre" && (
                    <BigField label="Précisez le lieu" icon="📍" value={form.lieu_naissance} onChange={(v) => setForm({ ...form, lieu_naissance: v })} placeholder="Ex: Sur la route de Bouaké" speak={speak} testID="lieu-autre" />
                  )}

                  <Text style={styles.label}>🕐 Heure de naissance</Text>
                  <DateField value={form.heure_naissance} onChange={(v) => setForm({ ...form, heure_naissance: v })} mode="time" placeholder="Ex: 08:30" testID="heure" />

                  <View style={styles.row2}>
                    <View style={{ flex: 1 }}>
                      <BigField label="Poids (g)" icon="⚖️" value={form.poids_naissance_g} onChange={(v) => setForm({ ...form, poids_naissance_g: v.replace(/[^0-9]/g, "") })} placeholder="3200" keyboard="number-pad" speak={speak} small testID="poids" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <BigField label="Taille (cm)" icon="📏" value={form.taille_naissance_cm} onChange={(v) => setForm({ ...form, taille_naissance_cm: v.replace(/[^0-9.,]/g, "") })} placeholder="50" keyboard="decimal-pad" speak={speak} small testID="taille" />
                    </View>
                  </View>

                  <View style={styles.apgarBox}>
                    <Text style={styles.apgarTitle}>🏆 Score APGAR (optionnel)</Text>
                    <Text style={styles.apgarHint}>Évaluation médicale de la vitalité du bébé (0 à 10).</Text>
                    <View style={styles.row2}>
                      <View style={{ flex: 1 }}>
                        <BigField label="À 1 minute" icon="⏱️" value={form.score_apgar_1min} onChange={(v) => setForm({ ...form, score_apgar_1min: v.replace(/[^0-9]/g, "").slice(0, 2) })} placeholder="0-10" keyboard="number-pad" speak={speak} small testID="apgar1" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <BigField label="À 5 minutes" icon="⏱️" value={form.score_apgar_5min} onChange={(v) => setForm({ ...form, score_apgar_5min: v.replace(/[^0-9]/g, "").slice(0, 2) })} placeholder="0-10" keyboard="number-pad" speak={speak} small testID="apgar5" />
                      </View>
                    </View>
                  </View>

                  <BigField label="Médecin / sage-femme" icon="👩‍⚕️" value={form.medecin_accoucheur} onChange={(v) => setForm({ ...form, medecin_accoucheur: v })} placeholder="Dr Nadia BAMBA (optionnel)" speak={speak} testID="medecin" />
                </View>
              )}

              {/* ÉTAPE 3 - Parents */}
              {step === 3 && (
                <View>
                  <View style={styles.parentBox}>
                    <Text style={styles.parentTitle}>👩 Mère</Text>
                    <BigField label="Nom et prénoms de la mère *" icon="📛" value={form.nom_mere} onChange={(v) => setForm({ ...form, nom_mere: v })} placeholder="Ex: Aïcha Diabaté" speak={speak} testID="nom-mere" />
                    <BigField label="Profession" icon="💼" value={form.profession_mere} onChange={(v) => setForm({ ...form, profession_mere: v })} placeholder="Ex: Couturière (optionnel)" speak={speak} testID="prof-mere" />
                    {(user as any)?.cmu?.numero && (
                      <View style={styles.cmuInfo}>
                        <Ionicons name="card" size={14} color={COLORS.success} />
                        <Text style={styles.cmuInfoText}>CMU pré-remplie : {(user as any).cmu.numero}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.parentBox}>
                    <Text style={styles.parentTitle}>👨 Père (optionnel)</Text>
                    <BigField label="Nom et prénoms du père" icon="📛" value={form.nom_pere} onChange={(v) => setForm({ ...form, nom_pere: v })} placeholder="Ex: Jean Kouamé" speak={speak} testID="nom-pere" />
                    <BigField label="Profession" icon="💼" value={form.profession_pere} onChange={(v) => setForm({ ...form, profession_pere: v })} placeholder="Ex: Mécanicien" speak={speak} testID="prof-pere" />
                  </View>
                </View>
              )}

              {/* ÉTAPE 4 - Récap + Consentement */}
              {step === 4 && (
                <View>
                  <View style={styles.recapBox}>
                    <Text style={styles.recapHead}>📋 Vérifiez les informations</Text>
                    <RecapLine label="Enfant" value={form.create_enfant ? `${form.enfant_nom} ${form.prenoms || ""} (${form.enfant_sexe === "F" ? "Fille" : "Garçon"})` : enfants.find(e => e.id === form.enfant_id)?.nom || "—"} />
                    <RecapLine label="Date" value={form.create_enfant ? new Date(form.enfant_date_naissance).toLocaleDateString("fr-FR") : "—"} />
                    <RecapLine label="Lieu" value={form.lieu_naissance} />
                    <RecapLine label="Heure" value={form.heure_naissance} />
                    {form.poids_naissance_g && <RecapLine label="Poids" value={`${form.poids_naissance_g} g`} />}
                    {form.taille_naissance_cm && <RecapLine label="Taille" value={`${form.taille_naissance_cm} cm`} />}
                    {form.score_apgar_5min && <RecapLine label="APGAR 5 min" value={`${form.score_apgar_5min} / 10`} />}
                    <RecapLine label="Mère" value={form.nom_mere} />
                    {form.nom_pere && <RecapLine label="Père" value={form.nom_pere} />}
                  </View>

                  <TouchableOpacity style={styles.consentBox} onPress={() => { setForm({ ...form, consentement_explicite: !form.consentement_explicite }); speak(form.consentement_explicite ? "Consentement retiré" : "Consentement validé"); }} testID="consent-toggle">
                    <Ionicons name={form.consentement_explicite ? "checkbox" : "square-outline"} size={26} color={form.consentement_explicite ? COLORS.success : COLORS.textMuted} />
                    <Text style={styles.consentText}>
                      Je certifie sur l'honneur l'exactitude des informations saisies. Je consens à la génération d'un PDF pré-rempli pour faciliter ma démarche à l'état civil.
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.disclaimer}>
                    <Ionicons name="information-circle" size={16} color={COLORS.warning} />
                    <Text style={styles.disclaimerText}>
                      Ce document n'a pas valeur d'acte de naissance officiel. Vous devez le présenter à l'état civil dans les 3 mois suivant la naissance.
                    </Text>
                  </View>
                </View>
              )}

              {/* Navigation */}
              <View style={styles.navRow}>
                {step > 1 ? (
                  <TouchableOpacity style={styles.btnSec} onPress={prev} testID="prev-btn">
                    <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
                    <Text style={styles.btnSecText}>Précédent</Text>
                  </TouchableOpacity>
                ) : <View style={{ flex: 1 }} />}
                {step < 4 ? (
                  <TouchableOpacity style={styles.btnPrimary} onPress={next} testID="next-btn">
                    <Text style={styles.btnPrimaryText}>Suivant</Text>
                    <Ionicons name="chevron-forward" size={18} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.btnPrimary, !form.consentement_explicite && { opacity: 0.5 }]} onPress={submit} disabled={!form.consentement_explicite} testID="submit-btn">
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Valider et générer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL POST-CRÉATION */}
      <Modal visible={!!postCreateModal} animationType="fade" transparent onRequestClose={() => setPostCreateModal(null)}>
        <View style={styles.successWrap}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}><Text style={{ fontSize: 50 }}>🎉</Text></View>
            <Text style={styles.successTitle}>Déclaration enregistrée !</Text>
            <Text style={styles.successRef}>Réf : {postCreateModal?.numero_reference}</Text>
            <Text style={styles.successSub}>Le PDF officiel pré-rempli est prêt. Que souhaitez-vous faire ?</Text>

            <View style={styles.successActions}>
              <TouchableOpacity style={styles.successBtn} onPress={() => downloadPdf(postCreateModal.id, postCreateModal.numero_reference)} testID="download-pdf-after">
                <Ionicons name="download" size={22} color="#fff" />
                <Text style={styles.successBtnText}>Télécharger / Partager</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.successBtn, { backgroundColor: COLORS.warning }]} onPress={() => sendEmail(postCreateModal.id, "email_maman")}>
                <Ionicons name="mail" size={22} color="#fff" />
                <Text style={styles.successBtnText}>Recevoir par email</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.successBtn, { backgroundColor: COLORS.success }]} onPress={() => sendEmail(postCreateModal.id, "email_etat_civil")}>
                <Ionicons name="business" size={22} color="#fff" />
                <Text style={styles.successBtnText}>Envoyer à l'état civil</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setPostCreateModal(null)} style={{ paddingVertical: 10 }}>
              <Text style={styles.closeLink}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- Helpers UI ----------
function StatusBadge({ status }: { status: string }) {
  const map: any = {
    en_attente: { bg: "#FFF3E0", fg: "#E88C00", label: "En attente" },
    validee: { bg: "#DCFCE7", fg: COLORS.success, label: "Validée ✓" }
  };
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

function BigField({ label, icon, value, onChange, placeholder, keyboard, speak, small, testID }: any) {
  return (
    <View>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{icon} {label}</Text>
        <TouchableOpacity onPress={() => speak?.(label)} style={styles.speakIcon}>
          <Ionicons name="volume-medium" size={14} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.bigInput, small && { padding: 10, fontSize: 14 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType={keyboard || "default"}
        testID={testID}
      />
    </View>
  );
}

function RecapLine({ label, value }: any) {
  return (
    <View style={styles.recapLine}>
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={styles.recapValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 19, fontWeight: "800", color: COLORS.textPrimary },
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },

  heroCta: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: COLORS.primary, borderRadius: 18, marginBottom: 18 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 10 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, paddingHorizontal: 20 },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  childEmoji: { fontSize: 32 },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  cardSub: { color: COLORS.textSecondary, fontSize: 12 },
  refTxt: { color: COLORS.primary, fontSize: 11, fontWeight: "800", marginTop: 2 },
  statusBadge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, alignSelf: "flex-start" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  detailLabel: { color: COLORS.textSecondary, fontSize: 12, width: 90 },
  detailValue: { color: COLORS.textPrimary, fontWeight: "600", flex: 1, fontSize: 13 },

  cardActions: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  actionTxt: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  validateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.success, paddingVertical: 12, borderRadius: RADIUS.pill, marginTop: 12 },
  validateText: { color: "#fff", fontWeight: "700" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "95%", paddingBottom: 30 },
  modalHead: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  stepHint: { color: COLORS.primary, fontSize: 11, fontWeight: "800" },
  modalTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginTop: 2 },
  voiceBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  progressBar: { flexDirection: "row", gap: 6, marginVertical: 14 },
  progressDot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.border },
  progressDotActive: { backgroundColor: COLORS.primary },

  modeSwitch: { flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: 12, padding: 4, marginBottom: 14 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8 },
  modeBtnActive: { backgroundColor: COLORS.primary },
  modeBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },

  enfRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  enfRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  enfName: { fontWeight: "700", color: COLORS.textPrimary },
  enfDate: { color: COLORS.textMuted, fontSize: 12 },

  fieldHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 6 },
  label: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14, marginBottom: 6 },
  speakIcon: { padding: 4 },
  bigInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, color: COLORS.textPrimary, fontSize: 15, fontWeight: "600" },

  sexRow: { flexDirection: "row", gap: 12 },
  sexBtn: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 6 },
  sexBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  sexLabel: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },

  lieuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  lieuChip: { flexBasis: "47%", alignItems: "center", paddingVertical: 16, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 4 },
  lieuChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  lieuLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary, textAlign: "center", paddingHorizontal: 4 },

  suggestRow: { padding: 12, backgroundColor: COLORS.surface, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  suggestRowActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  suggestText: { fontSize: 13, color: COLORS.textPrimary },

  row2: { flexDirection: "row", gap: 10 },
  apgarBox: { backgroundColor: "#FEF9E7", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A", marginTop: 14 },
  apgarTitle: { fontSize: 14, fontWeight: "800", color: "#92400E" },
  apgarHint: { fontSize: 11, color: "#92400E", marginTop: 2 },

  parentBox: { backgroundColor: COLORS.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  parentTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  cmuInfo: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, padding: 8, backgroundColor: "#DCFCE7", borderRadius: 8 },
  cmuInfoText: { fontSize: 12, color: COLORS.success, fontWeight: "700" },

  recapBox: { backgroundColor: COLORS.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  recapHead: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  recapLine: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recapLabel: { color: COLORS.textSecondary, fontSize: 12, width: 100 },
  recapValue: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13, flex: 1 },

  consentBox: { flexDirection: "row", gap: 10, padding: 14, backgroundColor: COLORS.primaryLight, borderRadius: 12, borderWidth: 2, borderColor: COLORS.primary, marginBottom: 12 },
  consentText: { flex: 1, fontSize: 12, color: COLORS.textPrimary, lineHeight: 17 },

  disclaimer: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#FEF3C7", borderRadius: 10, borderWidth: 1, borderColor: "#FDE68A" },
  disclaimerText: { flex: 1, fontSize: 11, color: "#92400E", lineHeight: 15 },

  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 10 },
  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: RADIUS.pill, flex: 1 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnSec: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 18, paddingVertical: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  btnSecText: { color: COLORS.textPrimary, fontWeight: "700" },

  successWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 20 },
  successCard: { backgroundColor: COLORS.bgPrimary, borderRadius: 24, padding: 26, width: "100%", maxWidth: 420, alignItems: "center" },
  successIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  successTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  successRef: { fontSize: 14, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  successSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, marginBottom: 18 },
  successActions: { width: "100%", gap: 10 },
  successBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 14 },
  successBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  closeLink: { color: COLORS.textMuted, fontWeight: "700", fontSize: 13, marginTop: 4 },
});
