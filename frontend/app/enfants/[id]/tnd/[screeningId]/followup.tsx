/**
 * M-CHAT-R/F — Entretien détaillé (Follow-up Interview)
 * Pour chaque item échoué du dépistage initial, on pose 2-3 questions de confirmation.
 * VoiceQA intégré pour accessibilité illettrée.
 */
import { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { cachedGet, smartPost, useOnlineStatus } from "../../../../../lib/offline";
import { formatError } from "../../../../../lib/api";
import VoiceQA from "../../../../../components/VoiceQA";
import { COLORS, RADIUS, SPACING } from "../../../../../constants/theme";

type FollowupItem = {
  item_id: number;
  original_question: string;
  behaviour: string;
  weighted: boolean;
  questions: string[];
};

export default function TndFollowup() {
  const router = useRouter();
  const { id, screeningId } = useLocalSearchParams<{ id: string; screeningId: string }>();
  const online = useOnlineStatus();
  const [data, setData] = useState<{ items_to_confirm: FollowupItem[]; level_initial: string; score_initial: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // answers[item_id] = ["yes"|"no"|"skip", ...]
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [itemIdx, setItemIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r = await cachedGet(`/tnd/followup/${screeningId}`);
        setData(r.data);
        // Initialiser tableau de réponses par item
        const init: Record<string, string[]> = {};
        (r.data?.items_to_confirm || []).forEach((it: FollowupItem) => {
          init[String(it.item_id)] = it.questions.map(() => "");
        });
        setAnswers(init);
      } catch (e) {
        Alert.alert("Erreur", formatError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [screeningId]);

  const total = data?.items_to_confirm.length || 0;
  const currentItem = data?.items_to_confirm[itemIdx];
  const totalQs = currentItem?.questions.length || 0;
  const currentAns = currentItem ? answers[String(currentItem.item_id)] || [] : [];

  const answer = (val: "yes" | "no") => {
    if (!currentItem) return;
    const key = String(currentItem.item_id);
    const nextArr = [...(answers[key] || [])];
    nextArr[qIdx] = val;
    setAnswers((p) => ({ ...p, [key]: nextArr }));
    setTimeout(goNext, 250);
  };

  const goNext = () => {
    if (!currentItem) return;
    if (qIdx < totalQs - 1) {
      setQIdx(qIdx + 1);
    } else if (itemIdx < total - 1) {
      setItemIdx(itemIdx + 1);
      setQIdx(0);
    }
  };

  const goPrev = () => {
    if (qIdx > 0) setQIdx(qIdx - 1);
    else if (itemIdx > 0) {
      setItemIdx(itemIdx - 1);
      const prev = data?.items_to_confirm[itemIdx - 1];
      setQIdx((prev?.questions.length || 1) - 1);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      // Nettoyage : remplacer "" par "skip"
      const payload: Record<string, string[]> = {};
      Object.entries(answers).forEach(([k, arr]) => {
        payload[k] = arr.map((v) => (v === "" ? "skip" : v));
      });
      const r = await smartPost(`/tnd/followup/${screeningId}`, { answers: payload });
      if (r.queued) {
        Alert.alert("📡 Hors-ligne", "Votre entretien détaillé sera envoyé à la reconnexion.", [
          { text: "OK", onPress: () => router.replace(`/enfants/${id}/tnd/${screeningId}` as any) },
        ]);
      } else {
        Alert.alert(
          "✅ Entretien détaillé enregistré",
          `Score final : ${r.data.score_final} (${r.data.level_final}). Voir le rapport mis à jour.`,
          [{ text: "Voir le rapport", onPress: () => router.replace(`/enfants/${id}/tnd/${screeningId}` as any) }]
        );
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const totalQuestionsAll = useMemo(
    () => (data?.items_to_confirm || []).reduce((s, it) => s + it.questions.length, 0),
    [data]
  );
  const answeredAll = useMemo(
    () => Object.values(answers).flat().filter((v) => v === "yes" || v === "no").length,
    [answers]
  );
  const progressPct = totalQuestionsAll ? Math.round((answeredAll / totalQuestionsAll) * 100) : 0;

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  if (!data || total === 0) {
    return (
      <SafeAreaView style={s.loader}>
        <Text style={{ fontSize: 50 }}>🟢</Text>
        <Text style={s.emptyTitle}>Aucun item à confirmer</Text>
        <Text style={s.emptyTxt}>Le dépistage initial n'a relevé aucun signal nécessitant un entretien détaillé.</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnTxt}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!currentItem) return null;
  const isLastItem = itemIdx === total - 1;
  const isLastQ = qIdx === totalQs - 1;
  const allAnswered = (() => {
    for (const it of data.items_to_confirm) {
      const arr = answers[String(it.item_id)] || [];
      if (arr.some((v) => v === "")) return false;
    }
    return true;
  })();

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={s.title}>Entretien détaillé</Text>
            <Text style={s.subtitle}>M-CHAT-R/F · {answeredAll} / {totalQuestionsAll}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress */}
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progressPct}%` }]} />
        </View>

        {!online && (
          <View style={s.offline}>
            <Ionicons name="cloud-offline" size={14} color="#92400E" />
            <Text style={s.offlineTxt}>Hors-ligne · vos réponses seront envoyées à la reconnexion</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={s.content}>
          {/* Item */}
          <View style={s.itemHead}>
            <Text style={s.itemNum}>Item {itemIdx + 1} sur {total}</Text>
            {currentItem.weighted && (
              <View style={s.critBadge}>
                <Text style={s.critBadgeTxt}>⚠️ ITEM CRITIQUE</Text>
              </View>
            )}
          </View>
          <Text style={s.behaviour}>Comportement étudié : {currentItem.behaviour}</Text>
          <Text style={s.origQuestion}>Question initiale : « {currentItem.original_question} »</Text>

          {/* Question actuelle */}
          <View style={s.qBox}>
            <Text style={s.qNum}>Question {qIdx + 1} sur {totalQs}</Text>
            <Text style={s.qTxt}>{currentItem.questions[qIdx]}</Text>

            <View style={{ marginTop: 14, alignItems: "center" }}>
              <VoiceQA
                key={`fu-${currentItem.item_id}-${qIdx}`}
                question={currentItem.questions[qIdx]}
                prefix={`Item ${itemIdx + 1} sur ${total}, question ${qIdx + 1} sur ${totalQs}`}
                onYes={() => answer("yes")}
                onNo={() => answer("no")}
                color="#8B5CF6"
              />
            </View>

            <View style={s.answerRow}>
              <TouchableOpacity
                style={[s.ansBtn, s.ansYes, currentAns[qIdx] === "yes" && s.ansActive]}
                onPress={() => answer("yes")}
              >
                <Ionicons name="checkmark-circle" size={28} color={currentAns[qIdx] === "yes" ? "#fff" : "#16A34A"} />
                <Text style={[s.ansTxt, { color: currentAns[qIdx] === "yes" ? "#fff" : "#16A34A" }]}>OUI</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.ansBtn, s.ansNo, currentAns[qIdx] === "no" && s.ansActive]}
                onPress={() => answer("no")}
              >
                <Ionicons name="close-circle" size={28} color={currentAns[qIdx] === "no" ? "#fff" : "#DC2626"} />
                <Text style={[s.ansTxt, { color: currentAns[qIdx] === "no" ? "#fff" : "#DC2626" }]}>NON</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pastilles de questions de l'item */}
          <View style={s.dots}>
            {currentItem.questions.map((_, i) => {
              const v = currentAns[i];
              return (
                <TouchableOpacity key={i} onPress={() => setQIdx(i)} style={[s.dot, v === "yes" && { backgroundColor: "#10B981" }, v === "no" && { backgroundColor: "#EF4444" }, i === qIdx && s.dotActive]}>
                  <Text style={[s.dotTxt, i === qIdx && { color: "#fff" }]}>{i + 1}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Navigation */}
          <View style={s.navRow}>
            <TouchableOpacity style={[s.navBtn, (itemIdx === 0 && qIdx === 0) && s.disabled]} onPress={goPrev} disabled={itemIdx === 0 && qIdx === 0}>
              <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
              <Text style={s.navTxt}>Précédent</Text>
            </TouchableOpacity>
            {isLastItem && isLastQ ? (
              <TouchableOpacity style={[s.submitBtn, (!allAnswered || submitting) && s.disabled]} onPress={submit} disabled={!allAnswered || submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#fff" />
                    <Text style={s.submitTxt}>Valider l'entretien</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.navBtn, s.navBtnPrimary]} onPress={goNext}>
                <Text style={[s.navTxt, { color: "#fff" }]}>Suivant</Text>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.disclaimer}>
            🛈 L'entretien M-CHAT-R/F permet de confirmer ou d'écarter les signaux relevés au dépistage initial.
            Un seul exemple concret du comportement suffit souvent à « désamorcer » un signal.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary, padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyTxt: { color: COLORS.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 19 },
  backBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.primary, borderRadius: RADIUS.pill },
  backBtnTxt: { color: "#fff", fontWeight: "800" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6, backgroundColor: COLORS.bgPrimary },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  progressBar: { height: 4, backgroundColor: COLORS.border, marginHorizontal: SPACING.lg, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#8B5CF6" },
  offline: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "#FEF3C7", marginHorizontal: SPACING.lg, marginTop: 8, padding: 8, borderRadius: 8 },
  offlineTxt: { color: "#92400E", fontSize: 11, fontWeight: "700", flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 60 },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  itemNum: { fontSize: 11, fontWeight: "800", color: "#8B5CF6", letterSpacing: 1.2, textTransform: "uppercase" },
  critBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#FEE2E2", borderRadius: 4 },
  critBadgeTxt: { color: "#B91C1C", fontSize: 10, fontWeight: "800" },
  behaviour: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  origQuestion: { fontSize: 12, color: COLORS.textMuted, fontStyle: "italic", marginBottom: 16 },
  qBox: { padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  qNum: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 },
  qTxt: { fontSize: 16, color: COLORS.textPrimary, lineHeight: 22, fontWeight: "600" },
  answerRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  ansBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: RADIUS.md, borderWidth: 2 },
  ansYes: { borderColor: "#16A34A", backgroundColor: "#F0FDF4" },
  ansNo: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  ansActive: { backgroundColor: "#1F2937", borderColor: "#1F2937" },
  ansTxt: { fontWeight: "800", fontSize: 15 },
  dots: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 16 },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dotActive: { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
  dotTxt: { fontWeight: "800", color: COLORS.textSecondary, fontSize: 12 },
  navRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  navBtnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  navTxt: { fontWeight: "800", color: COLORS.textPrimary },
  disabled: { opacity: 0.4 },
  submitBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.md, backgroundColor: "#10B981" },
  submitTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  disclaimer: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic", textAlign: "center", marginTop: 12, lineHeight: 16 },
});
