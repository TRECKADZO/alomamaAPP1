/**
 * Prise de rendez-vous — Wizard plein écran (style Doctolib).
 * 4 étapes : Praticien → Prestation & mode → Date & heure → Confirmation
 */
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError, isQuotaError } from "../lib/api";
import { smartPost } from "../lib/offline";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";
import { TYPES_CONSULTATION } from "../lib/data";

type Step = 1 | 2 | 3 | 4;

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const JOURS_COURT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_COURT = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function sameDate(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function toISO(d: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const c = new Date(d); c.setHours(h, m || 0, 0, 0);
  return c.toISOString();
}

export default function RdvNouveau() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ pro_id?: string }>();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Données
  const [pros, setPros] = useState<any[]>([]);
  const [prestations, setPrestations] = useState<any[]>([]);
  const [proDispos, setProDispos] = useState<any[]>([]);
  const [existingRdv, setExistingRdv] = useState<any[]>([]);

  // Sélections
  const [selectedPro, setSelectedPro] = useState<any | null>(null);
  const [selectedPrest, setSelectedPrest] = useState<any | null>(null);
  const [mode, setMode] = useState<"presentiel" | "teleconsultation">("presentiel");
  const [selectedDate, setSelectedDate] = useState<Date>(addDays(new Date(), 1));
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [motif, setMotif] = useState("");
  const [searchQ, setSearchQ] = useState("");

  // Init : load pros + gérer pro_id param
  useEffect(() => {
    (async () => {
      try {
        const [pRes, rdvRes] = await Promise.all([
          api.get("/professionnels").catch(() => ({ data: [] })),
          api.get("/rdv").catch(() => ({ data: [] })),
        ]);
        setPros(pRes.data || []);
        setExistingRdv(rdvRes.data || []);
        const pid = params?.pro_id as string | undefined;
        if (pid) {
          // Essaye de trouver dans la liste d'abord
          const p = (pRes.data || []).find((x: any) => x.id === pid);
          if (p) {
            await pickPro(p, true);
          } else {
            try {
              const r = await api.get(`/professionnels/${pid}`);
              await pickPro(r.data, true);
            } catch { /* ignore */ }
          }
        }
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPro = async (pro: any, autoAdvance = false) => {
    setSelectedPro(pro);
    setSelectedPrest(null);
    setSelectedTime("");
    try {
      const [pr, dp] = await Promise.all([
        api.get(`/professionnels/${pro.id}/prestations`).catch(() => ({ data: [] })),
        api.get(`/professionnels/${pro.id}/disponibilites`).catch(() => ({ data: { slots: [] } })),
      ]);
      setPrestations(pr.data || []);
      setProDispos((dp.data?.slots || []).filter((s: any) => s.actif));
    } catch { /* ignore */ }
    if (autoAdvance) setStep(2);
  };

  // Calcul des créneaux disponibles pour une date donnée (basé sur proDispos + durée prestation + RDV existants)
  const slotsForDate = (date: Date): { time: string; type_id: string; type_label: string; color: string; price?: number; cmu?: boolean }[] => {
    if (!selectedPro) return [];
    const jourName = JOURS[date.getDay()];
    const dispos = proDispos.filter((s) => s.jour.toLowerCase() === jourName);
    const takenTimes = existingRdv
      .filter((r) => r.pro_id === selectedPro.id && r.status !== "annule" && sameDate(new Date(r.date), date))
      .map((r) => new Date(r.date).toTimeString().slice(0, 5));
    const out: any[] = [];
    // Générer des sous-créneaux selon la durée de la prestation sélectionnée (ou 30 min par défaut)
    const stepMin = selectedPrest?.duree_min || 30;
    for (const s of dispos) {
      const [h1, m1] = s.heure_debut.split(":").map(Number);
      const [h2, m2] = s.heure_fin.split(":").map(Number);
      let cur = h1 * 60 + m1;
      const end = h2 * 60 + m2;
      while (cur + stepMin <= end) {
        const hh = String(Math.floor(cur / 60)).padStart(2, "0");
        const mm = String(cur % 60).padStart(2, "0");
        const timeStr = `${hh}:${mm}`;
        if (!takenTimes.includes(timeStr)) {
          // Filtrer : si c'est aujourd'hui, ne pas proposer d'heures passées
          const now = new Date();
          if (sameDate(date, now)) {
            if (cur * 60 * 1000 <= now.getHours() * 3600000 + now.getMinutes() * 60000) {
              cur += stepMin;
              continue;
            }
          }
          const typeColor = TYPES_CONSULTATION.find((t) => t.id === s.type_id)?.color || "#6B7280";
          out.push({ time: timeStr, type_id: s.type_id, type_label: s.type_label, color: typeColor, price: s.prix_fcfa, cmu: s.cmu_prise_en_charge });
        }
        cur += stepMin;
      }
    }
    return out;
  };

  // Trouve le prochain créneau disponible dans les 14 prochains jours
  const nextAvailable = () => {
    for (let i = 0; i < 14; i++) {
      const d = addDays(new Date(), i);
      const slots = slotsForDate(d);
      if (slots.length > 0) return { date: d, time: slots[0].time, slot: slots[0] };
    }
    return null;
  };

  const canProceed = () => {
    if (step === 1) return !!selectedPro;
    if (step === 2) return !!selectedPrest || prestations.length === 0;
    if (step === 3) return !!selectedTime;
    if (step === 4) return motif.trim().length > 0;
    return true;
  };

  const submit = async () => {
    if (!selectedPro || !selectedTime || !motif) return Alert.alert("Erreur", "Veuillez compléter toutes les étapes.");
    const payload: any = {
      pro_id: selectedPro.id,
      date: toISO(selectedDate, selectedTime),
      motif: motif.trim(),
      type_consultation: selectedType || (selectedPrest?.nom?.toLowerCase() || "consultation"),
      mode,
      prestation_id: selectedPrest?.id || "",
      tarif_fcfa: selectedPrest?.prix_fcfa || 10000,
    };
    setSubmitting(true);
    try {
      const r = await smartPost("/rdv", payload);
      if (r.queued) Alert.alert("Enregistré hors ligne", "Le rendez-vous sera envoyé dès la reconnexion.");
      else Alert.alert("✅ Rendez-vous demandé", `Votre demande auprès de ${selectedPro.name} a été envoyée. Vous serez notifiée dès confirmation.`, [
        { text: "Voir mes RDV", onPress: () => router.replace("/(tabs)/rdv") }
      ]);
      if (r.queued) router.back();
    } catch (e) {
      if (isQuotaError(e)) {
        Alert.alert("Quota atteint 💳", formatError(e), [
          { text: "Plus tard" },
          { text: "Passer Premium", onPress: () => router.push("/premium") },
        ]);
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((step - 1) as Step) : router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepBadge}>Étape {step} sur 4</Text>
          <Text style={styles.title}>
            {step === 1 && "Choisir un praticien"}
            {step === 2 && "Prestation & mode"}
            {step === 3 && "Date & heure"}
            {step === 4 && "Confirmation"}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={styles.progressBar}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.progressDot, step >= i && styles.progressDotActive]} />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ========== STEP 1 — PRATICIEN ========== */}
          {step === 1 && (
            <View>
              {/* Recherche */}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQ}
                  onChangeText={setSearchQ}
                  placeholder="Rechercher par nom, spécialité..."
                  placeholderTextColor={COLORS.textMuted}
                  testID="search-pro-input"
                />
                <TouchableOpacity onPress={() => { router.back(); router.push("/search"); }} style={styles.advancedBtn}>
                  <Ionicons name="options" size={16} color={COLORS.primary} />
                  <Text style={styles.advancedText}>Avancée</Text>
                </TouchableOpacity>
              </View>

              {/* Liste pros */}
              {pros.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="medkit-outline" size={48} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>Aucun professionnel</Text>
                  <Text style={styles.emptyText}>Utilisez la recherche avancée pour trouver un pro.</Text>
                  <TouchableOpacity style={styles.ctaPrimary} onPress={() => { router.back(); router.push("/search"); }}>
                    <Text style={styles.ctaPrimaryText}>Ouvrir la recherche</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                pros
                  .filter((p: any) => !searchQ || (p.name || "").toLowerCase().includes(searchQ.toLowerCase()) || (p.specialite || "").toLowerCase().includes(searchQ.toLowerCase()))
                  .map((p: any) => <ProCard key={p.id} pro={p} selected={selectedPro?.id === p.id} onPress={() => pickPro(p)} />)
              )}
            </View>
          )}

          {/* ========== STEP 2 — PRESTATION & MODE ========== */}
          {step === 2 && selectedPro && (
            <View>
              {/* Pro résumé en top */}
              <ProSummary pro={selectedPro} onChange={() => setStep(1)} />

              <Text style={styles.sectionTitle}>Type de consultation</Text>
              {prestations.length === 0 ? (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={18} color={COLORS.warning} />
                  <Text style={styles.infoText}>
                    Ce praticien n'a pas publié ses prestations. Vous pourrez préciser le motif à l'étape suivante. Le tarif sera négocié au cabinet.
                  </Text>
                </View>
              ) : (
                prestations.map((pr) => {
                  const sel = selectedPrest?.id === pr.id;
                  return (
                    <TouchableOpacity
                      key={pr.id}
                      style={[styles.prestCard, sel && styles.prestCardActive]}
                      onPress={() => { setSelectedPrest(pr); setSelectedTime(""); }}
                      testID={`prest-${pr.id}`}
                    >
                      <View style={styles.prestIcon}>
                        <Text style={{ fontSize: 22 }}>{iconForPrest(pr.nom)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.prestName}>{pr.nom}</Text>
                        {pr.description ? <Text style={styles.prestDesc} numberOfLines={2}>{pr.description}</Text> : null}
                        <View style={styles.prestMeta}>
                          <View style={styles.metaChip}><Ionicons name="time-outline" size={11} color={COLORS.textSecondary} /><Text style={styles.metaTxt}>{pr.duree_min} min</Text></View>
                          {pr.cmu_prise_en_charge && <View style={[styles.metaChip, { backgroundColor: "#DCFCE7" }]}><Text style={[styles.metaTxt, { color: COLORS.success }]}>CMU</Text></View>}
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.prestPrice}>{(pr.prix_fcfa || 0).toLocaleString()}</Text>
                        <Text style={styles.prestPriceCurr}>F CFA</Text>
                        {sel && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} style={{ marginTop: 4 }} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              <Text style={styles.sectionTitle}>Mode de consultation</Text>
              <View style={styles.modeGrid}>
                <TouchableOpacity style={[styles.modeCard, mode === "presentiel" && styles.modeCardActive]} onPress={() => setMode("presentiel")} testID="mode-presentiel">
                  <Text style={{ fontSize: 28 }}>🏥</Text>
                  <Text style={[styles.modeLabel, mode === "presentiel" && { color: "#fff" }]}>Au cabinet</Text>
                  <Text style={[styles.modeDesc, mode === "presentiel" && { color: "rgba(255,255,255,0.85)" }]}>Consultation sur place</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeCard, mode === "teleconsultation" && styles.modeCardActive]} onPress={() => setMode("teleconsultation")} testID="mode-tele">
                  <Text style={{ fontSize: 28 }}>📹</Text>
                  <Text style={[styles.modeLabel, mode === "teleconsultation" && { color: "#fff" }]}>Téléconsultation</Text>
                  <Text style={[styles.modeDesc, mode === "teleconsultation" && { color: "rgba(255,255,255,0.85)" }]}>Visio sécurisée</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ========== STEP 3 — DATE & HEURE ========== */}
          {step === 3 && selectedPro && (
            <View>
              <ProSummary pro={selectedPro} onChange={() => setStep(1)} />

              {/* Prochain créneau dispo */}
              {(() => {
                const next = nextAvailable();
                if (!next) return null;
                return (
                  <TouchableOpacity
                    style={styles.nextSlotCard}
                    onPress={() => { setSelectedDate(next.date); setSelectedTime(next.time); setSelectedType(next.slot.type_id); }}
                    testID="next-available-btn"
                  >
                    <Ionicons name="flash" size={18} color="#fff" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nextSlotTitle}>Prochain créneau disponible</Text>
                      <Text style={styles.nextSlotSub}>
                        {JOURS_COURT[next.date.getDay()]} {next.date.getDate()} {MOIS_COURT[next.date.getMonth()]} à {next.time}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                );
              })()}

              {/* Sélecteur de dates — 14 prochains jours */}
              <Text style={styles.sectionTitle}>Choisir la date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)).map((d) => {
                  const sel = sameDate(d, selectedDate);
                  const slots = slotsForDate(d);
                  const hasSlots = slots.length > 0;
                  const isToday = sameDate(d, new Date());
                  return (
                    <TouchableOpacity
                      key={i => null as any} // eslint
                      onPress={() => { setSelectedDate(d); setSelectedTime(""); }}
                      style={[styles.dateChip, sel && styles.dateChipActive, !hasSlots && styles.dateChipDisabled]}
                      disabled={!hasSlots}
                      testID={`date-chip-${d.toISOString().slice(0,10)}`}
                    >
                      <Text style={[styles.dateDow, sel && { color: "#fff" }]}>{JOURS_COURT[d.getDay()]}</Text>
                      <Text style={[styles.dateDay, sel && { color: "#fff" }]}>{d.getDate()}</Text>
                      <Text style={[styles.dateMonth, sel && { color: "#fff" }]}>{MOIS_COURT[d.getMonth()]}</Text>
                      {isToday && !sel && <View style={styles.todayDot} />}
                      {!hasSlots && <Text style={styles.noSlot}>—</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Créneaux horaires */}
              <Text style={styles.sectionTitle}>
                Créneaux · {selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </Text>
              {(() => {
                const slots = slotsForDate(selectedDate);
                if (slots.length === 0) {
                  return (
                    <View style={styles.infoBox}>
                      <Ionicons name="information-circle" size={18} color={COLORS.warning} />
                      <Text style={styles.infoText}>Aucun créneau disponible ce jour. Essayez une autre date.</Text>
                    </View>
                  );
                }
                // Group by type_id
                const byType: Record<string, any[]> = {};
                for (const s of slots) { (byType[s.type_id] = byType[s.type_id] || []).push(s); }
                return Object.entries(byType).map(([tid, sl]) => (
                  <View key={tid} style={{ marginBottom: 10 }}>
                    <View style={styles.typeHeaderRow}>
                      <View style={[styles.typeDot, { backgroundColor: sl[0].color }]} />
                      <Text style={styles.typeHeaderText}>{sl[0].type_label}</Text>
                      {sl[0].price && <Text style={styles.typeHeaderPrice}>{sl[0].price.toLocaleString()} F</Text>}
                    </View>
                    <View style={styles.timeGrid}>
                      {sl.map((s: any) => {
                        const sel = selectedTime === s.time && selectedType === s.type_id;
                        return (
                          <TouchableOpacity
                            key={`${tid}-${s.time}`}
                            style={[styles.timeBtn, sel && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                            onPress={() => { setSelectedTime(s.time); setSelectedType(s.type_id); }}
                            testID={`slot-${s.time}`}
                          >
                            <Text style={[styles.timeTxt, sel && { color: "#fff" }]}>{s.time}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ));
              })()}
            </View>
          )}

          {/* ========== STEP 4 — CONFIRMATION ========== */}
          {step === 4 && selectedPro && (
            <View>
              <ProSummary pro={selectedPro} onChange={() => setStep(1)} />

              <Text style={styles.sectionTitle}>Motif de consultation *</Text>
              <TextInput
                style={styles.textarea}
                value={motif}
                onChangeText={setMotif}
                placeholder="Ex: Suivi grossesse 3e trimestre, fièvre bébé, vaccination..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                testID="motif-input"
              />

              {/* Récap final */}
              <View style={styles.recapCard}>
                <Text style={styles.recapTitle}>📋 Récapitulatif</Text>
                <RecapRow icon="person" label="Praticien" value={selectedPro.name + (selectedPro.specialite ? ` · ${selectedPro.specialite}` : "")} />
                {selectedPrest && <RecapRow icon="medkit" label="Prestation" value={selectedPrest.nom} />}
                <RecapRow icon="calendar" label="Date" value={selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
                <RecapRow icon="time" label="Heure" value={selectedTime} />
                <RecapRow icon={mode === "presentiel" ? "location" : "videocam"} label="Mode" value={mode === "presentiel" ? "Au cabinet" : "Téléconsultation"} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total à prévoir</Text>
                  <View>
                    <Text style={styles.totalPrice}>{(selectedPrest?.prix_fcfa || 0).toLocaleString()} F CFA</Text>
                    {selectedPrest?.cmu_prise_en_charge && <Text style={styles.cmuHint}>🏥 Pris en charge CMU</Text>}
                  </View>
                </View>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
                <Text style={styles.infoText}>
                  Votre demande sera envoyée au praticien. Vous recevrez une notification dès sa confirmation. Le paiement se fait directement au cabinet ou via Mobile Money.
                </Text>
              </View>
            </View>
          )}

        </ScrollView>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          {step > 1 ? (
            <TouchableOpacity style={styles.prevBtn} onPress={() => setStep((step - 1) as Step)} testID="prev-step-btn">
              <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
              <Text style={styles.prevBtnText}>Précédent</Text>
            </TouchableOpacity>
          ) : <View />}
          {step < 4 ? (
            <TouchableOpacity
              style={[styles.nextBtn, !canProceed() && styles.btnDisabled]}
              onPress={() => canProceed() && setStep((step + 1) as Step)}
              disabled={!canProceed()}
              testID="next-step-btn"
            >
              <Text style={styles.nextBtnText}>Continuer</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, (!canProceed() || submitting) && styles.btnDisabled]}
              onPress={submit}
              disabled={!canProceed() || submitting}
              testID="submit-rdv-btn"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
              <Text style={styles.submitBtnText}>{submitting ? "Envoi..." : "Confirmer le rendez-vous"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ========== Sub-components ==========
function ProCard({ pro, selected, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.proCard, selected && styles.proCardActive]} onPress={onPress} testID={`pick-pro-${pro.id}`}>
      <View style={styles.proAvatar}>
        <Text style={styles.proAvatarText}>{(pro.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.proName}>{pro.name}</Text>
        <Text style={styles.proSpec}>{pro.specialite || "Professionnel de santé"}</Text>
        <View style={styles.proMetaRow}>
          {pro.ville && (
            <View style={styles.proMetaChip}>
              <Ionicons name="location-outline" size={10} color={COLORS.textSecondary} />
              <Text style={styles.proMetaText}>{pro.ville}</Text>
            </View>
          )}
          {pro.accepte_cmu && (
            <View style={[styles.proMetaChip, { backgroundColor: "#DCFCE7" }]}>
              <Text style={[styles.proMetaText, { color: COLORS.success, fontWeight: "800" }]}>🏥 CMU</Text>
            </View>
          )}
        </View>
      </View>
      {selected
        ? <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
        : <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />}
    </TouchableOpacity>
  );
}

function ProSummary({ pro, onChange }: any) {
  return (
    <View style={styles.proSummary}>
      <View style={styles.proAvatarSm}>
        <Text style={styles.proAvatarSmText}>{(pro.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.proSumName}>{pro.name}</Text>
        <Text style={styles.proSumSpec}>{pro.specialite || "Professionnel"}{pro.ville ? ` · ${pro.ville}` : ""}</Text>
      </View>
      <TouchableOpacity onPress={onChange} testID="change-pro-top">
        <Text style={styles.changeLink}>Changer</Text>
      </TouchableOpacity>
    </View>
  );
}

function RecapRow({ icon, label, value }: any) {
  return (
    <View style={styles.recapRow}>
      <Ionicons name={icon} size={15} color={COLORS.textSecondary} />
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={styles.recapValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function iconForPrest(nom: string) {
  const n = (nom || "").toLowerCase();
  if (n.includes("écho") || n.includes("echo")) return "🔊";
  if (n.includes("vaccin")) return "💉";
  if (n.includes("accouch")) return "👶";
  if (n.includes("pédiat") || n.includes("pediatr") || n.includes("enfant")) return "🧒";
  if (n.includes("urgence")) return "🚨";
  if (n.includes("nutrition")) return "🥗";
  if (n.includes("contracep")) return "💊";
  if (n.includes("prénat") || n.includes("prenat")) return "🤰";
  if (n.includes("gynéco") || n.includes("gyneco")) return "🌸";
  return "🩺";
}

// ========== Styles ==========
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg },
  backBtn: { padding: 4 },
  stepBadge: { fontSize: 11, fontWeight: "800", color: COLORS.primary },
  title: { fontSize: 19, fontWeight: "800", color: COLORS.textPrimary, marginTop: 2 },
  progressBar: { flexDirection: "row", gap: 6, paddingHorizontal: SPACING.xl, paddingBottom: 8 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progressDotActive: { backgroundColor: COLORS.primary },
  content: { padding: SPACING.xl, paddingTop: 0, paddingBottom: 100 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderRadius: 999, paddingHorizontal: 14, height: 44, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  advancedBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.primaryLight, borderRadius: 999 },
  advancedText: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },

  proCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 2, borderColor: "transparent" },
  proCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  proAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  proAvatarText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  proName: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  proSpec: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  proMetaRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  proMetaChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: COLORS.bgPrimary },
  proMetaText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: "700" },

  proSummary: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, marginBottom: 14, borderWidth: 1, borderColor: COLORS.primary },
  proAvatarSm: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  proAvatarSmText: { color: "#fff", fontWeight: "800" },
  proSumName: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  proSumSpec: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
  changeLink: { color: COLORS.primary, fontWeight: "800", fontSize: 12, textDecorationLine: "underline" },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 16, marginBottom: 10 },

  prestCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 8, borderWidth: 2, borderColor: "transparent" },
  prestCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  prestIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  prestName: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  prestDesc: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  prestMeta: { flexDirection: "row", gap: 6, marginTop: 6 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: COLORS.bgPrimary },
  metaTxt: { fontSize: 10, fontWeight: "700", color: COLORS.textSecondary },
  prestPrice: { fontSize: 17, fontWeight: "800", color: COLORS.primary },
  prestPriceCurr: { fontSize: 10, color: COLORS.textMuted, fontWeight: "700" },

  modeGrid: { flexDirection: "row", gap: 10 },
  modeCard: { flex: 1, alignItems: "center", padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: "transparent", gap: 4 },
  modeCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  modeLabel: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  modeDesc: { fontSize: 11, color: COLORS.textSecondary, textAlign: "center" },

  nextSlotCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, marginBottom: 10 },
  nextSlotTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  nextSlotSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  dateChip: { width: 62, padding: 8, backgroundColor: COLORS.surface, borderRadius: 12, alignItems: "center", borderWidth: 2, borderColor: COLORS.border },
  dateChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateChipDisabled: { opacity: 0.4 },
  dateDow: { fontSize: 10, color: COLORS.textSecondary, fontWeight: "700" },
  dateDay: { fontSize: 18, color: COLORS.textPrimary, fontWeight: "800", marginVertical: 2 },
  dateMonth: { fontSize: 9, color: COLORS.textMuted, fontWeight: "700" },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 3 },
  noSlot: { fontSize: 11, color: COLORS.textMuted },

  typeHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  typeHeaderText: { flex: 1, fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  typeHeaderPrice: { fontSize: 13, fontWeight: "800", color: COLORS.primary },

  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  timeBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  timeTxt: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },

  textarea: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.textPrimary, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: COLORS.border },

  recapCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginTop: 16, borderWidth: 1, borderColor: COLORS.border },
  recapTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  recapRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recapLabel: { fontSize: 12, color: COLORS.textSecondary, width: 80 },
  recapValue: { flex: 1, fontSize: 13, color: COLORS.textPrimary, fontWeight: "700" },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: COLORS.primary },
  totalLabel: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  totalPrice: { fontSize: 18, fontWeight: "800", color: COLORS.primary, textAlign: "right" },
  cmuHint: { fontSize: 10, color: COLORS.success, fontWeight: "700", marginTop: 2, textAlign: "right" },

  infoBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#FEF9E7", borderRadius: 10, borderWidth: 1, borderColor: "#FDE68A", marginTop: 10 },
  infoText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  emptyWrap: { alignItems: "center", padding: 30 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, marginTop: 10 },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 6, marginBottom: 16 },
  ctaPrimary: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  ctaPrimaryText: { color: "#fff", fontWeight: "800" },

  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bgPrimary },
  prevBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  prevBtnText: { fontWeight: "700", color: COLORS.textPrimary },
  nextBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14, borderRadius: 999, backgroundColor: COLORS.primary },
  nextBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  submitBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 999, backgroundColor: COLORS.success },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
