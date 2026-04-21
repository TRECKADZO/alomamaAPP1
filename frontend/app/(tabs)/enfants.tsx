import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { cachedGet, smartPost, smartDelete } from "../../lib/offline";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import DateField from "../../components/DateField";
import PickerField from "../../components/PickerField";
import { GROUPES_SANGUINS, VACCINS_ENFANTS } from "../../lib/data";

const FRENCH_MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

function formatDateFr(d: Date) {
  return `${d.getDate().toString().padStart(2, "0")} ${FRENCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function calculateAge(date_naissance: string) {
  const ms = Date.now() - new Date(date_naissance).getTime();
  const totalMonths = Math.floor(ms / (30.44 * 86400000));
  if (totalMonths < 12) return `${totalMonths} mois`;
  const annees = Math.floor(totalMonths / 12);
  const moisRestants = totalMonths % 12;
  return moisRestants > 0 ? `${annees} ans ${moisRestants} mois` : `${annees} ans`;
}

function getProchainVaccin(enfant: any) {
  if (!enfant.vaccins || enfant.vaccins.length === 0) return null;
  const list = enfant.vaccins
    .filter((v: any) => v.prochain_rappel && new Date(v.prochain_rappel) > new Date())
    .sort((a: any, b: any) => new Date(a.prochain_rappel).getTime() - new Date(b.prochain_rappel).getTime());
  return list[0] || null;
}

export default function Enfants() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [vaccinModal, setVaccinModal] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", date_naissance: "", sexe: "F", poids_kg: "", taille_cm: "", groupe_sanguin: "", allergies: "" });
  const [vaccin, setVaccin] = useState({ nom: "", date: "", prochain_rappel: "" });

  const load = async () => {
    try {
      const r = await cachedGet("/enfants");
      setList(r.data || []);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const create = async () => {
    if (!form.nom || !form.date_naissance) return Alert.alert("Champs requis", "Nom et date de naissance");
    try {
      const r = await smartPost("/enfants", {
        nom: form.nom,
        date_naissance: form.date_naissance,
        sexe: form.sexe,
        poids_kg: form.poids_kg ? parseFloat(form.poids_kg) : undefined,
        taille_cm: form.taille_cm ? parseFloat(form.taille_cm) : undefined,
        groupe_sanguin: form.groupe_sanguin || undefined,
        allergies: form.allergies ? form.allergies.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
      });
      setForm({ nom: "", date_naissance: "", sexe: "F", poids_kg: "", taille_cm: "", groupe_sanguin: "", allergies: "" });
      setModal(false);
      if (r.queued) Alert.alert("Enregistré hors ligne", "L'enfant sera ajouté dès la reconnexion.");
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const addVaccin = async () => {
    if (!vaccin.nom || !vaccin.date || !vaccinModal) return;
    try {
      const r = await smartPost(`/enfants/${vaccinModal}/vaccins`, {
        nom: vaccin.nom,
        date: vaccin.date,
        fait: true,
        prochain_rappel: vaccin.prochain_rappel || undefined,
      });
      setVaccin({ nom: "", date: "", prochain_rappel: "" });
      setVaccinModal(null);
      if (r.queued) Alert.alert("Enregistré hors ligne", "Le vaccin sera ajouté dès la reconnexion.");
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const remove = (id: string) => {
    Alert.alert("Supprimer ?", "Confirmer la suppression", [
      { text: "Annuler" },
      { text: "Supprimer", style: "destructive", onPress: async () => { await smartDelete(`/enfants/${id}`); load(); } },
    ]);
  };

  // Stats globales (alignées sur la source)
  const stats = {
    total: list.length,
    vaccinsOK: list.filter((e) => {
      const next = getProchainVaccin(e);
      if (!next) return true;
      const months = (new Date(next.prochain_rappel).getTime() - Date.now()) / (30.44 * 86400000);
      return months > 1;
    }).length,
    alertes: list.filter((e) => {
      const next = getProchainVaccin(e);
      if (!next) return false;
      const months = (new Date(next.prochain_rappel).getTime() - Date.now()) / (30.44 * 86400000);
      return months <= 1;
    }).length,
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Header — gradient blue/cyan icon + title */}
        <View style={styles.headerWrap}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={["#3B82F6", "#06B6D4"]}
              style={styles.headerIcon}
            >
              <Ionicons name="happy" size={28} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Carnets de Santé</Text>
              <Text style={styles.headerSub}>Suivi complet de vos enfants</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setModal(true)} testID="add-enfant-btn" style={{ marginTop: SPACING.md }}>
            <LinearGradient
              colors={["#3B82F6", "#06B6D4"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.addBtn}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addBtnText}>Ajouter un enfant</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats — 3 cards */}
        <View style={styles.statsRow}>
          <LinearGradient colors={["#EFF6FF", "#ECFEFF"]} style={styles.statCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statLabel}>Enfants suivis</Text>
              <Text style={[styles.statValue, { color: "#2563EB" }]}>{stats.total}</Text>
            </View>
            <Ionicons name="happy" size={28} color="#BFDBFE" />
          </LinearGradient>

          <LinearGradient colors={["#F0FDF4", "#ECFDF5"]} style={styles.statCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statLabel}>Vaccins OK</Text>
              <Text style={[styles.statValue, { color: "#16A34A" }]}>{stats.vaccinsOK}</Text>
            </View>
            <Ionicons name="medkit" size={28} color="#BBF7D0" />
          </LinearGradient>

          <LinearGradient colors={["#FFF7ED", "#FFFBEB"]} style={styles.statCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statLabel}>Alertes</Text>
              <Text style={[styles.statValue, { color: "#EA580C" }]}>{stats.alertes}</Text>
            </View>
            <Ionicons name="alert-circle" size={28} color="#FED7AA" />
          </LinearGradient>
        </View>

        {/* Liste des enfants */}
        {list.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <LinearGradient colors={["#DBEAFE", "#CFFAFE"]} style={styles.emptyIconBg}>
                <Ionicons name="happy" size={36} color="#3B82F6" />
              </LinearGradient>
            </View>
            <Text style={styles.emptyTitle}>Aucun enfant enregistré</Text>
            <Text style={styles.emptyText}>Commencez par ajouter le carnet de santé de votre enfant</Text>
            <TouchableOpacity onPress={() => setModal(true)} style={{ marginTop: SPACING.lg }}>
              <LinearGradient
                colors={["#3B82F6", "#06B6D4"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addBtn}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Ajouter mon premier enfant</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          list.map((e) => {
            const age = calculateAge(e.date_naissance);
            const prochainVaccin = getProchainVaccin(e);
            return (
              <View key={e.id} style={styles.childCard}>
                {/* Header bleu-cyan */}
                <LinearGradient colors={["#EFF6FF", "#ECFEFF"]} style={styles.childHead}>
                  <LinearGradient
                    colors={["#60A5FA", "#22D3EE"]}
                    style={styles.childAvatar}
                  >
                    {e.photo ? (
                      <Image source={{ uri: e.photo }} style={{ width: "100%", height: "100%", borderRadius: 24 }} />
                    ) : (
                      <Ionicons name="happy" size={28} color="#fff" />
                    )}
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.childName} numberOfLines={1}>{e.nom}</Text>
                    <Text style={styles.childAge}>{age}</Text>
                  </View>
                  <TouchableOpacity onPress={() => remove(e.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                </LinearGradient>

                <View style={styles.childBody}>
                  {/* Sexe */}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Sexe</Text>
                    <View style={styles.badgeOutline}>
                      <Text style={styles.badgeText}>{e.sexe === "F" ? "Fille" : "Garçon"}</Text>
                    </View>
                  </View>
                  {/* Groupe sanguin */}
                  {e.groupe_sanguin ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Groupe sanguin</Text>
                      <View style={[styles.badgeFilled, { backgroundColor: "#FEE2E2" }]}>
                        <Text style={[styles.badgeFilledText, { color: "#991B1B" }]}>{e.groupe_sanguin}</Text>
                      </View>
                    </View>
                  ) : null}
                  {/* Poids/Taille */}
                  {(e.poids_kg || e.taille_cm) && (
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Poids</Text>
                        <Text style={styles.metricValue}>{e.poids_kg ? `${e.poids_kg} kg` : "-"}</Text>
                      </View>
                      <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Taille</Text>
                        <Text style={styles.metricValue}>{e.taille_cm ? `${e.taille_cm} cm` : "-"}</Text>
                      </View>
                      <View style={styles.metric}>
                        <Text style={styles.metricLabel}>Vaccins</Text>
                        <Text style={styles.metricValue}>{(e.vaccins || []).length}</Text>
                      </View>
                    </View>
                  )}

                  {/* Prochain vaccin */}
                  {prochainVaccin && (
                    <View style={styles.alertBox}>
                      <View style={styles.alertHead}>
                        <Ionicons name="medkit" size={16} color="#EA580C" />
                        <Text style={styles.alertHeadText}>Prochain vaccin</Text>
                      </View>
                      <Text style={styles.alertNom}>{prochainVaccin.nom}</Text>
                      <Text style={styles.alertDate}>{formatDateFr(new Date(prochainVaccin.prochain_rappel))}</Text>
                    </View>
                  )}

                  {/* Allergies */}
                  {e.allergies && e.allergies.length > 0 && (
                    <View style={styles.allergyBox}>
                      <Text style={styles.allergyTitle}>Allergies</Text>
                      <Text style={styles.allergyText}>{e.allergies.join(", ")}</Text>
                    </View>
                  )}

                  {/* Liste vaccins */}
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.sectionTitleSmall}>Carnet de vaccination</Text>
                    {(e.vaccins || []).length === 0 ? (
                      <Text style={styles.noItems}>Aucun vaccin enregistré</Text>
                    ) : (
                      (e.vaccins || []).map((v: any) => (
                        <View key={v.id} style={styles.vaccinRow}>
                          <Ionicons
                            name={v.fait ? "checkmark-circle" : "time-outline"}
                            size={16}
                            color={v.fait ? COLORS.success : COLORS.warning}
                          />
                          <Text style={styles.vaccinNom}>{v.nom}</Text>
                          <Text style={styles.vaccinDate}>{formatDateFr(new Date(v.date))}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => setVaccinModal(e.id)}
                      testID={`add-vaccin-${e.id}`}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.actionBtnText}>Ajouter vaccin</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => Alert.alert("Carnet", "Vue complète du carnet bientôt disponible")}
                    >
                      <Ionicons name="book-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.actionBtnText}>Carnet</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Create child modal */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Nouvel enfant</Text>
                <TouchableOpacity onPress={() => setModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
              <Label text="Nom / Prénom *" />
              <TextInput style={styles.input} value={form.nom} onChangeText={(v) => setForm({ ...form, nom: v })} testID="enfant-nom" />
              <Label text="Date de naissance *" />
              <DateField value={form.date_naissance} onChange={(v) => setForm({ ...form, date_naissance: v })} maximumDate={new Date()} placeholder="Choisir la date de naissance" testID="enfant-dob" />
              <Label text="Sexe" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {["F", "M"].map((s) => (
                  <TouchableOpacity key={s} style={[styles.sexBtn, form.sexe === s && styles.sexBtnActive]} onPress={() => setForm({ ...form, sexe: s })} testID={`enfant-sexe-${s}`}>
                    <Text style={[styles.sexText, form.sexe === s && { color: "#fff" }]}>{s === "F" ? "👧 Fille" : "👦 Garçon"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label text="Poids (kg)" />
                  <TextInput style={styles.input} value={form.poids_kg} onChangeText={(v) => setForm({ ...form, poids_kg: v })} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Label text="Taille (cm)" />
                  <TextInput style={styles.input} value={form.taille_cm} onChangeText={(v) => setForm({ ...form, taille_cm: v })} keyboardType="decimal-pad" />
                </View>
              </View>
              <Label text="Groupe sanguin" />
              <View style={styles.input}>
                <PickerField
                  value={form.groupe_sanguin}
                  onChange={(v) => setForm({ ...form, groupe_sanguin: v })}
                  options={GROUPES_SANGUINS}
                  placeholder="Choisir un groupe sanguin"
                  testID="enfant-groupe-sanguin"
                />
              </View>
              <Label text="Allergies (séparées par des virgules)" />
              <TextInput style={styles.input} value={form.allergies} onChangeText={(v) => setForm({ ...form, allergies: v })} placeholder="arachides, lait..." placeholderTextColor={COLORS.textMuted} />
              <TouchableOpacity style={styles.btnPrimary} onPress={create} testID="save-enfant-btn">
                <Text style={styles.btnPrimaryText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Vaccin modal */}
      <Modal visible={!!vaccinModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Ajouter un vaccin</Text>
              <TouchableOpacity onPress={() => setVaccinModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Label text="Nom du vaccin *" />
            <View style={styles.input}>
              <PickerField
                value={vaccin.nom}
                onChange={(v) => setVaccin({ ...vaccin, nom: v })}
                options={VACCINS_ENFANTS}
                placeholder="Choisir un vaccin"
                searchable
                testID="vaccin-nom"
              />
            </View>
            <Label text="Date administrée *" />
            <DateField value={vaccin.date} onChange={(v) => setVaccin({ ...vaccin, date: v })} maximumDate={new Date()} placeholder="Choisir la date" testID="vaccin-date" />
            <Label text="Prochain rappel (optionnel)" />
            <DateField value={vaccin.prochain_rappel} onChange={(v) => setVaccin({ ...vaccin, prochain_rappel: v })} placeholder="Choisir la date de rappel" />
            <TouchableOpacity style={styles.btnPrimary} onPress={addVaccin} testID="save-vaccin-btn">
              <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const Label = ({ text }: { text: string }) => (
  <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 }}>
    {text}
  </Text>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },

  headerWrap: { marginBottom: SPACING.lg },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: RADIUS.md,
    ...SHADOW,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: SPACING.lg },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: RADIUS.lg,
    ...SHADOW,
  },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  statValue: { fontSize: 26, fontWeight: "800" },

  empty: {
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 36,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 20,
  },
  emptyIconWrap: { marginBottom: 14 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },

  childCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW,
  },
  childHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  childAvatar: {
    width: 64,
    height: 64,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...SHADOW,
  },
  childName: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  childAge: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  childBody: { padding: 16, paddingTop: 6, gap: 10 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  infoLabel: { color: COLORS.textSecondary, fontSize: 13 },
  badgeOutline: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },
  badgeFilled: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  badgeFilledText: { fontSize: 12, fontWeight: "700" },

  metricsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  metric: { flex: 1, backgroundColor: COLORS.bgSecondary, padding: 10, borderRadius: RADIUS.md, alignItems: "center" },
  metricLabel: { fontSize: 10, color: COLORS.textSecondary, textTransform: "uppercase", fontWeight: "700" },
  metricValue: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14, marginTop: 2 },

  alertBox: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: RADIUS.md,
    padding: 12,
  },
  alertHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  alertHeadText: { color: "#9A3412", fontWeight: "700", fontSize: 12 },
  alertNom: { color: "#7C2D12", fontWeight: "600", fontSize: 13 },
  alertDate: { color: "#C2410C", fontSize: 11, marginTop: 2 },

  allergyBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: RADIUS.md, padding: 12 },
  allergyTitle: { color: "#7F1D1D", fontWeight: "700", fontSize: 12 },
  allergyText: { color: "#991B1B", fontSize: 13, marginTop: 2 },

  sectionTitleSmall: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13, marginBottom: 6 },
  noItems: { color: COLORS.textMuted, fontStyle: "italic", fontSize: 12 },
  vaccinRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  vaccinNom: { flex: 1, color: COLORS.textPrimary, fontWeight: "500", fontSize: 13 },
  vaccinDate: { color: COLORS.textSecondary, fontSize: 11 },

  actionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  actionBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, color: COLORS.textPrimary },
  sexBtn: { flex: 1, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  sexBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sexText: { color: COLORS.textPrimary, fontWeight: "600" },
  btnPrimary: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center", marginTop: 20 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
