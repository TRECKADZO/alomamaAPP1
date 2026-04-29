import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Line, Path, Circle, Text as SvgText, Rect } from "react-native-svg";
import { api, formatError } from "../../lib/api";
import { smartPost } from "../../lib/offline";
import { useAuth } from "../../lib/auth";
import DateField from "../../components/DateField";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const CLASSIF_COLORS: Record<string, string> = {
  tres_bas: "#DC2626",
  bas: "#F59E0B",
  normal: "#10B981",
  eleve: "#F59E0B",
  tres_eleve: "#DC2626",
};
const CLASSIF_LABEL: Record<string, string> = {
  tres_bas: "Très bas",
  bas: "Bas",
  normal: "Normal",
  eleve: "Élevé",
  tres_eleve: "Très élevé",
};

export default function Croissance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"poids" | "taille">("poids");
  const [addModal, setAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mes, setMes] = useState({
    date: new Date().toISOString().slice(0, 10),
    poids_kg: "",
    taille_cm: "",
    perimetre_cranien_cm: "",
  });

  const load = async () => {
    try {
      const r = await api.get(`/enfants/${id}/croissance-oms`);
      setData(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const saveMesure = async () => {
    if (!mes.date) return Alert.alert("Date requise");
    if (!mes.poids_kg && !mes.taille_cm && !mes.perimetre_cranien_cm) {
      return Alert.alert("Au moins une mesure", "Saisissez au moins le poids, la taille ou le périmètre crânien.");
    }
    const payload: any = { date: new Date(mes.date).toISOString() };
    if (mes.poids_kg) payload.poids_kg = parseFloat(mes.poids_kg.replace(",", "."));
    if (mes.taille_cm) payload.taille_cm = parseFloat(mes.taille_cm.replace(",", "."));
    if (mes.perimetre_cranien_cm) payload.perimetre_cranien_cm = parseFloat(mes.perimetre_cranien_cm.replace(",", "."));
    setSubmitting(true);
    try {
      const r = await smartPost(`/enfants/${id}/mesures`, payload);
      setAddModal(false);
      setMes({ date: new Date().toISOString().slice(0, 10), poids_kg: "", taille_cm: "", perimetre_cranien_cm: "" });
      if (r?.queued) Alert.alert("Enregistré hors ligne", "La mesure sera envoyée dès la reconnexion.");
      else Alert.alert("✅ Mesure enregistrée");
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setSubmitting(false); }
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.center}><Text>Pas de données</Text></SafeAreaView>;

  const enfant = data.enfant || {};
  const points = data.points || [];
  const refs = tab === "poids" ? data.reference_poids_age : data.reference_taille_age;
  const unit = tab === "poids" ? "kg" : "cm";
  const keyY = tab === "poids" ? "poids_kg" : "taille_cm";
  const keyClass = tab === "poids" ? "classification_poids" : "classification_taille";

  // Scale
  const W = Math.min(Dimensions.get("window").width - 32, 500);
  const H = 260;
  const PAD_L = 36, PAD_R = 12, PAD_T = 18, PAD_B = 28;
  const maxX = 60;
  const allY = refs.flatMap((r: any) => [r.p3, r.p97]).concat(points.map((p: any) => p[keyY] || 0));
  const maxY = Math.max(...allY) * 1.05;
  const minY = Math.min(...allY.filter((v: number) => v > 0)) * 0.9;
  const fx = (x: number) => PAD_L + (x / maxX) * (W - PAD_L - PAD_R);
  const fy = (y: number) => H - PAD_B - ((y - minY) / (maxY - minY)) * (H - PAD_T - PAD_B);

  const buildPath = (key: string) => {
    let d = "";
    refs.forEach((r: any, i: number) => {
      d += (i === 0 ? "M" : "L") + fx(r.mois) + "," + fy(r[key]);
    });
    return d;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Courbes OMS — {enfant.nom}</Text>
        {user?.role === "maman" ? (
          <TouchableOpacity onPress={() => setAddModal(true)} style={styles.addBtn} testID="add-mesure-btn">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <View style={styles.infoCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoName}>{enfant.nom}</Text>
            <Text style={styles.infoMeta}>{enfant.sexe === "F" ? "👧 Fille" : "👦 Garçon"} · né(e) le {enfant.date_naissance?.slice(0, 10)}</Text>
            {enfant.numero_cmu ? (
              <View style={styles.cmuRow}>
                <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
                <Text style={styles.cmuText}>N° CMU : {enfant.numero_cmu}</Text>
              </View>
            ) : (
              <Text style={styles.cmuMiss}>N° CMU non renseigné</Text>
            )}
          </View>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === "poids" && styles.tabActive]} onPress={() => setTab("poids")}>
            <Ionicons name="scale" size={14} color={tab === "poids" ? "#fff" : COLORS.textSecondary} />
            <Text style={[styles.tabText, tab === "poids" && { color: "#fff" }]}>Poids / Âge</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === "taille" && styles.tabActive]} onPress={() => setTab("taille")}>
            <Ionicons name="resize" size={14} color={tab === "taille" ? "#fff" : COLORS.textSecondary} />
            <Text style={[styles.tabText, tab === "taille" && { color: "#fff" }]}>Taille / Âge</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chartCard}>
          <Svg width={W} height={H}>
            {/* Grid horizontal */}
            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
              const y = PAD_T + r * (H - PAD_T - PAD_B);
              const val = maxY - r * (maxY - minY);
              return (
                <React.Fragment key={i}>
                  <Line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#E5E7EB" strokeWidth={0.5} />
                  <SvgText x={PAD_L - 4} y={y + 3} fontSize="9" fill="#6B7280" textAnchor="end">{val.toFixed(1)}</SvgText>
                </React.Fragment>
              );
            })}
            {/* Axes labels months */}
            {[0, 6, 12, 24, 36, 48, 60].map((m) => (
              <SvgText key={m} x={fx(m)} y={H - PAD_B + 14} fontSize="9" fill="#6B7280" textAnchor="middle">{m}mo</SvgText>
            ))}
            {/* Bands : P3-P15 (jaune clair), P15-P85 (vert clair normal), P85-P97 (jaune clair), P3 & P97 (rouge clair) */}
            <Path d={buildPath("p97") + " L " + fx(60) + "," + fy(0) + " L " + fx(0) + "," + fy(0) + " Z"} fill="#FEE2E2" opacity={0.3} />
            <Path d={buildPath("p3") + " L " + fx(60) + "," + fy(0) + " L " + fx(0) + "," + fy(0) + " Z"} fill="#FFFFFF" />
            {/* Lines */}
            <Path d={buildPath("p3")} stroke="#DC2626" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            <Path d={buildPath("p15")} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            <Path d={buildPath("p50")} stroke="#10B981" strokeWidth={1.8} fill="none" />
            <Path d={buildPath("p85")} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            <Path d={buildPath("p97")} stroke="#DC2626" strokeDasharray="4 3" strokeWidth={1.2} fill="none" />
            {/* Child points */}
            {points.filter((p: any) => p[keyY]).map((p: any, i: number) => (
              <Circle key={i} cx={fx(p.age_mois)} cy={fy(p[keyY])} r={5} fill="#6366F1" stroke="#fff" strokeWidth={1.5} />
            ))}
          </Svg>

          <View style={styles.legend}>
            <Legend color="#10B981" label="P50 (médiane OMS)" solid />
            <Legend color="#F59E0B" label="P15-P85 (normal)" />
            <Legend color="#DC2626" label="P3/P97 (extrême)" />
            <Legend color="#6366F1" label={enfant.nom} dot />
          </View>
        </View>

        {/* Points list */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 8 }}>
          <Text style={[styles.h2, { marginTop: 0, marginBottom: 0 }]}>Historique des mesures</Text>
          {user?.role === "maman" && (
            <TouchableOpacity onPress={() => setAddModal(true)} style={styles.addInlineBtn} testID="add-mesure-inline">
              <Ionicons name="add-circle" size={16} color={COLORS.primary} />
              <Text style={styles.addInlineText}>Ajouter</Text>
            </TouchableOpacity>
          )}
        </View>
        {points.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>Aucune mesure enregistrée pour le moment.</Text>
            {user?.role === "maman" && (
              <TouchableOpacity onPress={() => setAddModal(true)} style={styles.emptyBtn} testID="add-mesure-empty">
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Ajouter ma 1ère mesure</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          points.filter((p: any) => p[keyY]).map((p: any, i: number) => (
            <View key={i} style={styles.ptRow}>
              <View style={styles.ptLeft}>
                <Text style={styles.ptAge}>{Math.round(p.age_mois)}m</Text>
                <Text style={styles.ptDate}>{p.date?.slice(0, 10)}</Text>
              </View>
              <Text style={styles.ptVal}>{p[keyY]} {unit}</Text>
              {p[keyClass] && (
                <View style={[styles.classifBadge, { backgroundColor: CLASSIF_COLORS[p[keyClass]] + "22" }]}>
                  <Text style={[styles.classifText, { color: CLASSIF_COLORS[p[keyClass]] }]}>
                    {CLASSIF_LABEL[p[keyClass]]}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        <Text style={styles.source}>📊 {data.source}</Text>
      </ScrollView>

      {/* Modal d'ajout de mesure */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>📏 Nouvelle mesure</Text>
                <TouchableOpacity onPress={() => setAddModal(false)} testID="close-mesure-modal">
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>Saisissez au moins une valeur (poids, taille ou périmètre crânien).</Text>

              <Text style={styles.label}>Date de la mesure *</Text>
              <DateField
                value={mes.date}
                onChange={(v) => setMes({ ...mes, date: v })}
                mode="date"
                maximumDate={new Date()}
                placeholder="Choisir une date"
                testID="mesure-date"
              />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Poids (kg)</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="scale" size={18} color={COLORS.textMuted} />
                    <TextInput
                      style={styles.input}
                      value={mes.poids_kg}
                      onChangeText={(v) => setMes({ ...mes, poids_kg: v.replace(/[^0-9.,]/g, "") })}
                      placeholder="Ex: 7.5"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="decimal-pad"
                      testID="mesure-poids"
                    />
                    <Text style={styles.unit}>kg</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Taille (cm)</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="resize" size={18} color={COLORS.textMuted} />
                    <TextInput
                      style={styles.input}
                      value={mes.taille_cm}
                      onChangeText={(v) => setMes({ ...mes, taille_cm: v.replace(/[^0-9.,]/g, "") })}
                      placeholder="Ex: 68"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="decimal-pad"
                      testID="mesure-taille"
                    />
                    <Text style={styles.unit}>cm</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.label}>Périmètre crânien (cm)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.input}
                  value={mes.perimetre_cranien_cm}
                  onChangeText={(v) => setMes({ ...mes, perimetre_cranien_cm: v.replace(/[^0-9.,]/g, "") })}
                  placeholder="Ex: 42 (optionnel)"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  testID="mesure-pc"
                />
                <Text style={styles.unit}>cm</Text>
              </View>

              <TouchableOpacity onPress={saveMesure} disabled={submitting} style={[styles.saveBtn, submitting && { opacity: 0.6 }]} testID="save-mesure-btn">
                {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                <Text style={styles.saveBtnText}>{submitting ? "Enregistrement..." : "Enregistrer la mesure"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Stub React import for fragments
import React from "react";

function Legend({ color, label, solid, dot }: { color: string; label: string; solid?: boolean; dot?: boolean }) {
  return (
    <View style={styles.legItem}>
      {dot ? (
        <View style={[styles.legDot, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legLine, { backgroundColor: color, opacity: solid ? 1 : 0.7 }]} />
      )}
      <Text style={styles.legText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },

  infoCard: { flexDirection: "row", padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  infoName: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  infoMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cmuRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  cmuText: { fontSize: 12, fontWeight: "700", color: "#16A34A" },
  cmuMiss: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontStyle: "italic" },

  tabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },

  chartCard: { padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", marginBottom: 14 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 8 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legLine: { width: 18, height: 2 },
  legDot: { width: 9, height: 9, borderRadius: 5 },
  legText: { fontSize: 10, color: COLORS.textSecondary },

  h2: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4, marginBottom: 8 },
  ptRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  ptLeft: { width: 70 },
  ptAge: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  ptDate: { fontSize: 10, color: COLORS.textMuted },
  ptVal: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  classifBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  classifText: { fontSize: 10, fontWeight: "800" },

  empty: { padding: 14, alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md },
  emptyTxt: { color: COLORS.textMuted, fontSize: 12, textAlign: "center", marginBottom: 12 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: COLORS.primary },
  emptyBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  source: { fontSize: 10, color: COLORS.textMuted, textAlign: "center", marginTop: 18, fontStyle: "italic" },

  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", ...SHADOW },
  addInlineBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.primaryLight },
  addInlineText: { color: COLORS.primary, fontWeight: "800", fontSize: 12 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, paddingBottom: 40 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  modalSub: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary, marginTop: 12, marginBottom: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 48 },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: "600" },
  unit: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  row2: { flexDirection: "row", gap: 10 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, paddingVertical: 14, borderRadius: 999, backgroundColor: COLORS.primary },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
