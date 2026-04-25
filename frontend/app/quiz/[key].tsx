import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const LEVEL_COLORS: Record<string, [string, string]> = {
  low: ["#10B981", "#059669"],
  medium: ["#F59E0B", "#D97706"],
  high: ["#DC2626", "#991B1B"],
};

export default function QuizScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key?: string }>();
  const [quiz, setQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<(boolean | null)[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!key) return;
    api.get(`/quiz/${key}`).then((r) => {
      setQuiz(r.data);
      setAnswers(Array(r.data.questions.length).fill(null));
      setLoading(false);
    }).catch((e) => { Alert.alert("Erreur", formatError(e)); setLoading(false); });
  }, [key]);

  const setAns = (i: number, v: boolean) => {
    const next = [...answers];
    next[i] = v;
    setAnswers(next);
  };

  const submit = async () => {
    if (answers.some((a) => a === null)) {
      Alert.alert("Incomplet", "Merci de répondre à toutes les questions.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/quiz/${key}/score`, { answers });
      setResult(data);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setResult(null);
    setAnswers(Array(quiz.questions.length).fill(null));
  };

  if (loading || !quiz) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  if (result) {
    const colors = LEVEL_COLORS[result.result.level] || LEVEL_COLORS.medium;
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient colors={colors} style={styles.headerResult}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
          <Text style={styles.resultTitle}>{result.result.title}</Text>
          <Text style={styles.score}>Score : {result.score}</Text>
        </LinearGradient>
        <ScrollView contentContainerStyle={{ padding: SPACING.xl }}>
          <View style={styles.resultBox}>
            <Text style={styles.resultMsg}>{result.result.msg}</Text>
          </View>
          <TouchableOpacity onPress={reset} style={styles.btn}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.btnText}>Refaire le test</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/search")} style={styles.btn2}>
            <Ionicons name="medkit" size={16} color={COLORS.primary} />
            <Text style={styles.btn2Text}>Trouver un professionnel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#0EA5E9", "#3B82F6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{quiz.title}</Text>
          <Text style={styles.sub}>{quiz.questions.length} questions</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 80 }}>
        <View style={styles.introBox}>
          <Ionicons name="information-circle" size={16} color="#1E40AF" />
          <Text style={styles.introText}>{quiz.intro}</Text>
        </View>

        {quiz.questions.map((q: any, i: number) => (
          <View key={i} style={styles.qCard}>
            <Text style={styles.qNumber}>Question {i + 1}</Text>
            <Text style={styles.qText}>{q.q}</Text>
            <View style={styles.choiceRow}>
              <TouchableOpacity
                onPress={() => setAns(i, true)}
                style={[styles.choice, answers[i] === true && styles.choiceYes]}
                testID={`q${i}-yes`}
              >
                <Ionicons name={answers[i] === true ? "checkmark-circle" : "ellipse-outline"} size={18} color={answers[i] === true ? "#fff" : "#10B981"} />
                <Text style={[styles.choiceText, answers[i] === true && { color: "#fff" }]}>Oui</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAns(i, false)}
                style={[styles.choice, answers[i] === false && styles.choiceNo]}
                testID={`q${i}-no`}
              >
                <Ionicons name={answers[i] === false ? "close-circle" : "ellipse-outline"} size={18} color={answers[i] === false ? "#fff" : "#DC2626"} />
                <Text style={[styles.choiceText, answers[i] === false && { color: "#fff" }]}>Non</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={submit} disabled={submitting} style={[styles.btn, { marginTop: 16 }]} testID="submit-quiz">
          {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-done" size={18} color="#fff" />}
          <Text style={styles.btnText}>{submitting ? "Calcul..." : "Voir mon résultat"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerResult: { padding: 24, alignItems: "center", borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", position: "absolute", left: 16, top: 16 },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  resultTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 30 },
  score: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: 6 },
  introBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#DBEAFE", borderRadius: RADIUS.md, marginBottom: 14, borderWidth: 1, borderColor: "#93C5FD" },
  introText: { flex: 1, color: "#1E3A8A", fontSize: 12, lineHeight: 16 },
  qCard: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  qNumber: { color: COLORS.primary, fontSize: 11, fontWeight: "800", marginBottom: 4 },
  qText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600", marginBottom: 12, lineHeight: 19 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgPrimary },
  choiceYes: { backgroundColor: "#10B981", borderColor: "#10B981" },
  choiceNo: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  choiceText: { fontWeight: "800", fontSize: 13, color: COLORS.textPrimary },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 999, marginTop: 10 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btn2: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.surface, paddingVertical: 14, borderRadius: 999, marginTop: 10, borderWidth: 1.5, borderColor: COLORS.primary },
  btn2Text: { color: COLORS.primary, fontWeight: "800", fontSize: 14 },
  resultBox: { padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  resultMsg: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
});
