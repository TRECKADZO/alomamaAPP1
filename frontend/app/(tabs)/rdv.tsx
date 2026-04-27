import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError, isQuotaError } from "../../lib/api";
import { cachedGet, smartPost, smartPatch } from "../../lib/offline";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import DateField from "../../components/DateField";
import PickerField from "../../components/PickerField";
import { TYPES_CONSULTATION } from "../../lib/data";

const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"];

const STATUT_COLORS: any = {
  en_attente: { bg: "#FFF3E0", fg: "#E88C00", dot: "#F59E0B" },
  confirme: { bg: "#DCFCE7", fg: "#166534", dot: "#16A34A" },
  annule: { bg: "#FEE2E2", fg: "#991B1B", dot: "#DC2626" },
  termine: { bg: "#DBEAFE", fg: "#1E40AF", dot: "#2563EB" },
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Rdv() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ pro_id?: string }>();
  const [rdv, setRdv] = useState<any[]>([]);
  const [pros, setPros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [viewMode, setViewMode] = useState<"calendrier" | "liste">("calendrier");
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterStatut, setFilterStatut] = useState("tous");
  const [form, setForm] = useState({ pro_id: "", date: "", motif: "", type_consultation: "", mode: "presentiel", prestation_id: "", tarif_fcfa: 10000 });
  const [prestations, setPrestations] = useState<any[]>([]);
  const [proDispos, setProDispos] = useState<any[]>([]); // créneaux du pro avec type+durée+prix

  const load = async () => {
    try {
      const r = await cachedGet("/rdv");
      setRdv(r.data || []);
      if (user?.role === "maman") {
        const p = await cachedGet("/professionnels");
        setPros(p.data || []);
      }
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [user]));

  // Auto-open modal si on arrive depuis la recherche avec un pro_id pré-sélectionné
  useEffect(() => {
    const pid = params?.pro_id as string | undefined;
    if (pid && user?.role === "maman") {
      (async () => {
        setForm((f) => ({ ...f, pro_id: pid, prestation_id: "", tarif_fcfa: 10000 }));
        try {
          const pr = await api.get(`/professionnels/${pid}/prestations`);
          setPrestations(pr.data || []);
        } catch {}
        setModal(true);
        // nettoyer le paramètre pour éviter ré-ouverture au focus
        router.setParams({ pro_id: undefined as any });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.pro_id, user?.role]);

  const create = async () => {
    if (!form.pro_id || !form.date || !form.motif || !form.type_consultation) return Alert.alert("Champs requis", "Veuillez remplir tous les champs");
    try {
      const r = await smartPost("/rdv", form);
      setForm({ pro_id: "", date: "", motif: "", type_consultation: "", mode: "presentiel", prestation_id: "", tarif_fcfa: 10000 });
      setModal(false);
      if (r.queued) Alert.alert("Enregistré hors ligne", "Le rendez-vous sera envoyé dès la reconnexion.");
      load();
    } catch (e) {
      if (isQuotaError(e)) {
        Alert.alert("Quota atteint 💳", formatError(e), [
          { text: "Plus tard" },
          { text: "Passer Premium", onPress: () => router.push("/premium") },
        ]);
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    }
  };

  const changeStatus = async (rid: string, statusVal: string) => {
    try { await smartPatch(`/rdv/${rid}/status?status_val=${statusVal}`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  // Filtrage
  const filtered = filterStatut === "tous" ? rdv : rdv.filter((r) => r.status === filterStatut);

  // Calendrier
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const firstDow = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const gridDays: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) gridDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) gridDays.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (gridDays.length % 7 !== 0) gridDays.push(null);

  const rdvsOfDay = (d: Date) => filtered.filter((r) => sameDay(new Date(r.date), d));
  const rdvsSelected = rdvsOfDay(selectedDate);

  const statuts = ["tous", "en_attente", "confirme", "termine", "annule"];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Rendez-vous</Text>
        {user?.role === "maman" && (
          <TouchableOpacity style={styles.addHeader} onPress={() => setModal(true)} testID="add-rdv-btn">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Toggle vue */}
      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tab, viewMode === "calendrier" && styles.tabActive]} onPress={() => setViewMode("calendrier")} testID="view-cal">
          <Ionicons name="calendar" size={16} color={viewMode === "calendrier" ? "#fff" : COLORS.textPrimary} />
          <Text style={[styles.tabText, viewMode === "calendrier" && { color: "#fff" }]}>Calendrier</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, viewMode === "liste" && styles.tabActive]} onPress={() => setViewMode("liste")} testID="view-list">
          <Ionicons name="list" size={16} color={viewMode === "liste" ? "#fff" : COLORS.textPrimary} />
          <Text style={[styles.tabText, viewMode === "liste" && { color: "#fff" }]}>Liste</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 6, paddingBottom: 60 }}>
        {/* CTA principal pour trouver un médecin (Maman) */}
        {user?.role === "maman" && (
          <TouchableOpacity
            style={styles.findDoctorCta}
            onPress={() => router.push("/search")}
            testID="find-doctor-cta"
          >
            <View style={styles.findDoctorIcon}>
              <Ionicons name="search" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.findDoctorTitle}>Trouver un médecin</Text>
              <Text style={styles.findDoctorSub}>Sage-femme · Pédiatre · Échographie · CMU</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Filtres statut */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {statuts.map((s) => (
            <TouchableOpacity key={s} style={[styles.filterChip, filterStatut === s && styles.filterChipActive]} onPress={() => setFilterStatut(s)}>
              <Text style={[styles.filterText, filterStatut === s && { color: "#fff" }]}>
                {s === "tous" ? "Tous" : s === "en_attente" ? "En attente" : s === "confirme" ? "Confirmés" : s === "termine" ? "Terminés" : "Annulés"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {viewMode === "calendrier" ? (
          <>
            <View style={styles.calCard}>
              <View style={styles.calHead}>
                <TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} testID="cal-prev">
                  <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.calMonth}>{MOIS_FR[cursor.getMonth()]} {cursor.getFullYear()}</Text>
                <TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} testID="cal-next">
                  <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.dowRow}>
                {JOURS_FR.map((j, i) => <Text key={i} style={styles.dow}>{j}</Text>)}
              </View>

              <View style={styles.gridDays}>
                {gridDays.map((d, i) => {
                  if (!d) return <View key={i} style={styles.dayEmpty} />;
                  const rdvs = rdvsOfDay(d);
                  const isSelected = sameDay(d, selectedDate);
                  const isToday = sameDay(d, new Date());
                  return (
                    <TouchableOpacity key={i} style={styles.dayCell} onPress={() => setSelectedDate(d)} testID={`day-${d.getDate()}`}>
                      <View style={[
                        styles.dayInner,
                        isSelected && styles.daySelected,
                        isToday && !isSelected && styles.dayToday,
                      ]}>
                        <Text style={[styles.dayNum, (isSelected || isToday) && { fontWeight: "800", color: isSelected ? "#fff" : COLORS.primary }]}>{d.getDate()}</Text>
                        {rdvs.length > 0 && (
                          <View style={styles.dotsRow}>
                            {rdvs.slice(0, 3).map((r, idx) => (
                              <View key={idx} style={[styles.dayDot, { backgroundColor: isSelected ? "#fff" : (STATUT_COLORS[r.status]?.dot || COLORS.primary) }]} />
                            ))}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* RDV du jour sélectionné */}
            <Text style={styles.sectionTitle}>
              {sameDay(selectedDate, new Date()) ? "Aujourd'hui" : selectedDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              {" "}· {rdvsSelected.length} RDV
            </Text>
            {rdvsSelected.length === 0 ? (
              <Text style={styles.empty}>Aucun rendez-vous ce jour</Text>
            ) : (
              rdvsSelected.map((r) => <RdvCard key={r.id} r={r} user={user} changeStatus={changeStatus} router={router} />)
            )}
          </>
        ) : (
          // LISTE
          filtered.length === 0 ? (
            <View style={styles.emptyBig}>
              <Ionicons name="calendar-outline" size={60} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Aucun rendez-vous</Text>
            </View>
          ) : (
            filtered
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((r) => <RdvCard key={r.id} r={r} user={user} changeStatus={changeStatus} router={router} />)
          )
        )}
      </ScrollView>

      {/* Create RDV modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouveau rendez-vous</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
              </View>
              <Text style={styles.label}>Professionnel</Text>
              {pros.map((p) => (
                <TouchableOpacity key={p.id} style={[styles.proCard, form.pro_id === p.id && styles.proCardActive]} onPress={async () => {
                  setForm({ ...form, pro_id: p.id, prestation_id: "", tarif_fcfa: 10000 });
                  try {
                    const r = await api.get(`/pros/${p.id}/prestations`);
                    setPrestations(r.data || []);
                  } catch { setPrestations([]); }
                  try {
                    const d = await api.get(`/professionnels/${p.id}/disponibilites`);
                    setProDispos((d.data?.slots || []).filter((s: any) => s.actif));
                  } catch { setProDispos([]); }
                }} testID={`pro-${p.id}`}>
                  <View style={styles.proAvatar}><Text style={styles.proAvatarText}>{p.name.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proName}>{p.name}</Text>
                    <Text style={styles.proSpec}>{p.specialite || "Professionnel"}</Text>
                  </View>
                  {form.pro_id === p.id && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}

              {/* Récap des disponibilités du pro avec type+durée+prix */}
              {form.pro_id && proDispos.length > 0 && (
                <View style={styles.disposCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.disposTitle}>Créneaux proposés</Text>
                  </View>
                  {Object.entries(
                    proDispos.reduce((acc: Record<string, any[]>, s: any) => {
                      if (!acc[s.jour]) acc[s.jour] = [];
                      acc[s.jour].push(s);
                      return acc;
                    }, {})
                  ).map(([jour, slots]: [string, any[]]) => (
                    <View key={jour} style={styles.disposJour}>
                      <Text style={styles.disposJourLabel}>{jour.charAt(0).toUpperCase() + jour.slice(1)}</Text>
                      {slots.map((s, i) => {
                        const tcolor = TYPES_CONSULTATION.find((t) => t.id === s.type_id)?.color || "#6B7280";
                        return (
                          <View key={i} style={[styles.disposSlot, { borderLeftColor: tcolor }]}>
                            <View style={[styles.disposBadge, { backgroundColor: tcolor }]}>
                              <Text style={styles.disposBadgeText}>{s.type_label}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.disposHeure}>{s.heure_debut} → {s.heure_fin}</Text>
                              <Text style={styles.disposMeta}>⏱ {s.duree_minutes} min · RDV de {s.duree_minutes} minutes</Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              {s.prix_fcfa != null ? (
                                <Text style={styles.disposPrix}>{s.prix_fcfa.toLocaleString()} F</Text>
                              ) : (
                                <Text style={styles.disposPrixNA}>Tarif sur place</Text>
                              )}
                              {s.cmu_prise_en_charge && (
                                <View style={styles.cmuBadge}><Text style={styles.cmuBadgeText}>🏥 CMU</Text></View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                  <Text style={styles.disposHint}>💡 Consultez ces créneaux puis renseignez ci-dessous date, heure et type souhaités.</Text>
                </View>
              )}

              {form.pro_id && prestations.length > 0 && (
                <>
                  <Text style={styles.label}>Prestation & tarif *</Text>
                  {prestations.map((pr) => {
                    const selected = form.prestation_id === pr.id;
                    return (
                      <TouchableOpacity
                        key={pr.id}
                        style={[styles.prestationCard, selected && styles.prestationCardActive]}
                        onPress={() => setForm({ ...form, prestation_id: pr.id, tarif_fcfa: pr.prix_fcfa, motif: form.motif || pr.nom })}
                        testID={`prestation-${pr.id}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.prestationName}>{pr.nom}</Text>
                          {pr.description ? <Text style={styles.prestationDesc} numberOfLines={1}>{pr.description}</Text> : null}
                          <Text style={styles.prestationMeta}>⏱ {pr.duree_min} min</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.prestationPrice}>{pr.prix_fcfa.toLocaleString()} F</Text>
                          {selected && <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
              {form.pro_id && prestations.length === 0 && (
                <View style={styles.noPrest}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.noPrestText}>Ce pro n'a pas encore publié ses prestations. Le tarif sera négocié au cabinet.</Text>
                </View>
              )}

              <Text style={styles.label}>Mode de consultation *</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeBtn, form.mode === "presentiel" && styles.modeBtnActive]}
                  onPress={() => setForm({ ...form, mode: "presentiel" })}
                  testID="mode-presentiel"
                >
                  <Ionicons name="location" size={18} color={form.mode === "presentiel" ? "#fff" : COLORS.primary} />
                  <Text style={[styles.modeText, form.mode === "presentiel" && { color: "#fff" }]}>Présentiel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, form.mode === "teleconsultation" && styles.modeBtnActive]}
                  onPress={() => setForm({ ...form, mode: "teleconsultation" })}
                  testID="mode-tele"
                >
                  <Ionicons name="videocam" size={18} color={form.mode === "teleconsultation" ? "#fff" : COLORS.primary} />
                  <Text style={[styles.modeText, form.mode === "teleconsultation" && { color: "#fff" }]}>Téléconsultation</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Type de consultation *</Text>
              <View style={styles.input}>
                <PickerField
                  value={form.type_consultation}
                  onChange={(v) => setForm({ ...form, type_consultation: v })}
                  options={TYPES_CONSULTATION.map((t) => ({ value: t.id, label: t.label }))}
                  placeholder="Choisir un type"
                  searchable
                  testID="rdv-type"
                />
              </View>

              <Text style={styles.label}>Date et heure *</Text>
              <DateField
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
                mode="datetime"
                minimumDate={new Date()}
                placeholder="Choisir date et heure"
                testID="rdv-date"
              />

              <Text style={styles.label}>Motif de consultation *</Text>
              <TextInput style={[styles.input, { height: 80 }]} value={form.motif} onChangeText={(v) => setForm({ ...form, motif: v })} multiline placeholder="Ex: Consultation prénatale" placeholderTextColor={COLORS.textMuted} testID="rdv-motif" />

              <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-rdv-btn">
                <Text style={styles.btnPrimaryText}>Confirmer la demande</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function RdvCard({ r, user, changeStatus, router }: any) {
  const c = STATUT_COLORS[r.status] || STATUT_COLORS.en_attente;
  const d = new Date(r.date);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.dateChip, { backgroundColor: c.bg }]}>
          <Text style={[styles.dateDay, { color: c.fg }]}>{d.getDate()}</Text>
          <Text style={[styles.dateMonth, { color: c.fg }]}>{d.toLocaleString("fr-FR", { month: "short" })}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{user?.role === "maman" ? r.pro_name : r.maman_name}</Text>
          <Text style={styles.cardSub}>{user?.role === "maman" ? r.pro_specialite : "Patiente"}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="document-text-outline" size={12} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{r.motif}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name={r.mode === "teleconsultation" ? "videocam-outline" : "location-outline"} size={12} color={r.mode === "teleconsultation" ? "#0369A1" : COLORS.success} />
            <Text style={[styles.metaText, { color: r.mode === "teleconsultation" ? "#0369A1" : COLORS.success, fontWeight: "700" }]}>
              {r.mode === "teleconsultation" ? "Téléconsultation" : "Présentiel"}
            </Text>
          </View>
        </View>
        <Text style={[styles.statusBadge, { backgroundColor: c.bg, color: c.fg }]}>
          {r.status === "en_attente" ? "En attente" : r.status === "confirme" ? "Confirmé" : r.status === "annule" ? "Annulé" : "Terminé"}
        </Text>
      </View>

      {user?.role === "professionnel" && r.status === "en_attente" && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => changeStatus(r.id, "confirme")}>
            <Ionicons name="checkmark" size={16} color={COLORS.success} />
            <Text style={[styles.actionText, { color: COLORS.success }]}>Confirmer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => changeStatus(r.id, "annule")}>
            <Ionicons name="close" size={16} color={COLORS.error} />
            <Text style={[styles.actionText, { color: COLORS.error }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      )}
      {(user?.role === "professionnel" || user?.role === "maman") && r.status === "confirme" && (
        <View style={[styles.actions, { flexWrap: "wrap" }]}>
          {user?.role === "professionnel" && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => changeStatus(r.id, "termine")}>
              <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
              <Text style={[styles.actionText, { color: COLORS.primary }]}>Marquer terminé</Text>
            </TouchableOpacity>
          )}
          {r.mode === "teleconsultation" && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => router.push(`/video-call/${r.id}`)} testID={`video-${r.id}`}>
              <Ionicons name="videocam" size={16} color="#0369A1" />
              <Text style={[styles.actionText, { color: "#0369A1" }]}>Rejoindre la visio</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl, paddingBottom: 10 },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  addHeader: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },

  findDoctorCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    marginBottom: 14,
  },
  findDoctorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  findDoctorTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  findDoctorSub: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 2 },
  tabsRow: { flexDirection: "row", gap: 6, paddingHorizontal: SPACING.xl, marginBottom: 4 },
  tab: { flex: 1, flexDirection: "row", gap: 6, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  filtersRow: { gap: 6, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
  calCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  calMonth: { fontWeight: "800", fontSize: 16, color: COLORS.textPrimary, textTransform: "capitalize" },
  dowRow: { flexDirection: "row", marginBottom: 4 },
  dow: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  gridDays: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  dayEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  dayInner: { flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  dayNum: { fontSize: 14, color: COLORS.textPrimary, fontWeight: "500" },
  daySelected: { backgroundColor: COLORS.primary },
  dayToday: { borderWidth: 2, borderColor: COLORS.primary },
  dotsRow: { flexDirection: "row", gap: 2, marginTop: 2, height: 5 },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 15, marginBottom: 10, textTransform: "capitalize" },
  empty: { color: COLORS.textMuted, textAlign: "center", fontStyle: "italic", paddingVertical: 20 },
  emptyBig: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardTop: { flexDirection: "row", gap: 12 },
  dateChip: { width: 56, height: 56, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  dateDay: { fontSize: 22, fontWeight: "800" },
  dateMonth: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  cardName: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  cardSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaText: { color: COLORS.textSecondary, fontSize: 12 },
  statusBadge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, alignSelf: "flex-start", textTransform: "uppercase" },
  actions: { flexDirection: "row", gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontWeight: "600", fontSize: 13 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  proCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  proCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  proAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  proAvatarText: { color: "#fff", fontWeight: "800" },
  proName: { fontWeight: "700", color: COLORS.textPrimary },
  proSpec: { color: COLORS.textSecondary, fontSize: 12 },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border },
  modeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeText: { fontWeight: "700", fontSize: 13, color: COLORS.textPrimary },
  prestationCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface, marginBottom: 6 },
  prestationCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  prestationName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  prestationDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  prestationMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  prestationPrice: { fontSize: 15, fontWeight: "800", color: COLORS.primary },
  noPrest: { flexDirection: "row", gap: 6, alignItems: "center", padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  noPrestText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },

  disposCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 6, marginBottom: 12 },
  disposTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  disposJour: { marginTop: 8 },
  disposJourLabel: { fontSize: 12, fontWeight: "800", color: COLORS.textPrimary, textTransform: "capitalize", marginBottom: 4 },
  disposSlot: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: COLORS.bgSecondary, borderRadius: 8, borderLeftWidth: 3, marginBottom: 4 },
  disposBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  disposBadgeText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  disposHeure: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  disposMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  disposPrix: { fontSize: 14, fontWeight: "800", color: COLORS.primary },
  disposPrixNA: { fontSize: 10, color: COLORS.textMuted, fontStyle: "italic" },
  cmuBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginTop: 2 },
  cmuBadgeText: { fontSize: 9, fontWeight: "800", color: "#059669" },
  disposHint: { fontSize: 11, color: COLORS.textSecondary, fontStyle: "italic", marginTop: 8, lineHeight: 15 },
});
