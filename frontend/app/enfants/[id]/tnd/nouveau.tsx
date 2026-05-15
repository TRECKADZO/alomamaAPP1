/**
 * Suivi du développement TND — Nouveau dépistage M-CHAT-R (wizard 20 questions).
 */
import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError } from "../../../../lib/api";
import { cachedGet, smartPost, useOnlineStatus } from "../../../../lib/offline";
import VoiceQA from "../../../../components/VoiceQA";
import { COLORS, RADIUS, SHADOW } from "../../../../constants/theme";

export default function TndNew() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnlineStatus();
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      try {
        const r = await cachedGet("/tnd/questions");
        setQuestions(r.data?.questions || []);
      } catch (e) { Alert.alert("Erreur", formatError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  // Écran intro / mise en garde
  if (idx === -1) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>🧠 Dépistage TND</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={26} color="#B45309" />
            <Text style={styles.warningTxt}>
              <Text style={{ fontWeight: "800", fontSize: 14 }}>Avant de commencer{"\n\n"}</Text>
              Cet outil est un <Text style={{ fontWeight: "800" }}>dépistage</Text>, il ne remplace pas un diagnostic médical.
              {"\n\n"}Répondez avec sincérité — il n'y a pas de bonne ou mauvaise réponse. {"\n\n"}Le résultat vous guidera vers les actions adaptées.
            </Text>
          </View>
          <TouchableOpacity style={styles.startBtn} onPress={() => setIdx(0)} testID="tnd-begin">
            <Text style={styles.startTxt}>Commencer le questionnaire</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const q = questions[idx];
  const total = questions.length;
  const progress = ((idx + 1) / total) * 100;

  const answer = (val: "yes" | "no") => {
    setAnswers((a) => ({ ...a, [String(q.id)]: val }));
    if (idx < total - 1) setIdx(idx + 1);
  };

  const submit = async () => {
    const answered = Object.keys(answers).length;
    if (answered < 16) {
      return Alert.alert("Questions manquantes", `Veuillez répondre à au moins 16 questions (vous en avez répondu ${answered}).`);
    }
    setSubmitting(true);
    try {
      const r = await smartPost("/tnd/screening", { enfant_id: id, answers });
      if (r.queued) {
        Alert.alert("📡 Hors-ligne", "Votre dépistage sera envoyé dès que vous serez reconnectée.");
        router.replace(`/enfants/${id}/tnd` as any);
      } else {
        router.replace(`/enfants/${id}/tnd/${r.data.id}` as any);
      }
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setSubmitting(false); }
  };

  const goPrev = () => { if (idx > 0) setIdx(idx - 1); };
  const goNext = () => { if (idx < total - 1) setIdx(idx + 1); };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Question {idx + 1} / {total}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Barre de progression */}
      <View style={styles.progressBg}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!online && (
          <View style={{ backgroundColor: "#FEF3C7", padding: 10, borderRadius: 8, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="cloud-offline" size={16} color="#92400E" />
            <Text style={{ color: "#92400E", fontSize: 12, fontWeight: "700", flex: 1 }}>Mode hors-ligne. Votre dépistage sera envoyé à la reconnexion.</Text>
          </View>
        )}
        <View style={styles.questionBox}>
          <Text style={styles.questionNum}>Question {q.id}</Text>
          <Text style={styles.questionTxt}>{q.fr}</Text>
          <View style={{ marginTop: 12 }}>
            <VoiceQA
              key={`v-${q.id}`}
              question={q.fr}
              prefix={`Question ${idx + 1} sur ${total}`}
              autoRead={false}
              onYes={() => answer("yes")}
              onNo={() => answer("no")}
              color="#8B5CF6"
            />
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.ansBtn, styles.ansYes, answers[String(q.id)] === "yes" && styles.ansActive]} onPress={() => answer("yes")} testID={`ans-yes-${q.id}`}>
            <Ionicons name="checkmark-circle" size={28} color={answers[String(q.id)] === "yes" ? "#fff" : "#10B981"} />
            <Text style={[styles.ansTxt, answers[String(q.id)] === "yes" && { color: "#fff" }]}>OUI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ansBtn, styles.ansNo, answers[String(q.id)] === "no" && styles.ansActiveNo]} onPress={() => answer("no")} testID={`ans-no-${q.id}`}>
            <Ionicons name="close-circle" size={28} color={answers[String(q.id)] === "no" ? "#fff" : "#EF4444"} />
            <Text style={[styles.ansTxt, answers[String(q.id)] === "no" && { color: "#fff" }]}>NON</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, idx === 0 && { opacity: 0.4 }]} onPress={goPrev} disabled={idx === 0}>
            <Ionicons name="arrow-back" size={18} color={COLORS.textPrimary} />
            <Text style={styles.navTxt}>Précédent</Text>
          </TouchableOpacity>
          {idx < total - 1 ? (
            <TouchableOpacity style={styles.navBtn} onPress={goNext}>
              <Text style={styles.navTxt}>Suivant</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting} testID="tnd-submit">
              {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-done" size={18} color="#fff" />}
              <Text style={styles.submitTxt}>{submitting ? "Calcul..." : "Voir le résultat"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 16 },
  warningBox: { flexDirection: "row", gap: 10, padding: 16, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FCD34D", borderRadius: RADIUS.md, alignItems: "flex-start" },
  warningTxt: { flex: 1, fontSize: 13, color: "#78350F", lineHeight: 19 },
  startBtn: { padding: 16, backgroundColor: "#8B5CF6", borderRadius: RADIUS.md, alignItems: "center", marginTop: 16 },
  startTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  progressBg: { height: 6, backgroundColor: COLORS.border, marginHorizontal: 16, borderRadius: 999, overflow: "hidden" },
  progressBar: { height: 6, backgroundColor: "#8B5CF6" },
  questionBox: { padding: 20, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, ...SHADOW, gap: 10 },
  questionNum: { fontSize: 11, fontWeight: "800", color: "#8B5CF6", textTransform: "uppercase" },
  questionTxt: { fontSize: 16, color: COLORS.textPrimary, lineHeight: 23, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 12 },
  ansBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 18, borderRadius: RADIUS.md, borderWidth: 2 },
  ansYes: { backgroundColor: "#D1FAE5", borderColor: "#10B981" },
  ansNo: { backgroundColor: "#FEE2E2", borderColor: "#EF4444" },
  ansActive: { backgroundColor: "#10B981", borderColor: "#10B981" },
  ansActiveNo: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  ansTxt: { fontWeight: "900", fontSize: 16, color: COLORS.textPrimary },
  navRow: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginTop: 8 },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  navTxt: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
  submitBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#10B981", borderRadius: RADIUS.md },
  submitTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
