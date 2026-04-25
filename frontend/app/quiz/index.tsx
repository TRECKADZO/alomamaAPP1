import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function QuizIndex() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/quiz").then((r) => { setQuizzes(r.data.quizzes || []); setLoading(false); });
  }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#0EA5E9", "#3B82F6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🩺 Tests d'auto-évaluation</Text>
          <Text style={styles.sub}>Identifier les signes d'alerte</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={18} color="#1E40AF" />
          <Text style={styles.disclaimerText}>
            Ces tests ne remplacent pas une consultation médicale. Ils vous aident à identifier les signes qui méritent qu'un professionnel vous examine.
          </Text>
        </View>

        {quizzes.map((q) => (
          <TouchableOpacity key={q.key} onPress={() => router.push(`/quiz/${q.key}`)} style={styles.quizCard} testID={`quiz-${q.key}`}>
            <View style={styles.quizIcon}>
              <Ionicons name={iconFor(q.key)} size={26} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quizTitle}>{q.title}</Text>
              <Text style={styles.quizMeta}>{q.n_questions} questions · ~2 min</Text>
              <Text style={styles.quizIntro} numberOfLines={2}>{q.intro}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function iconFor(key: string): any {
  if (key === "anemie") return "fitness";
  if (key === "depression_postpartum") return "heart-circle";
  if (key === "sommeil_bebe") return "moon";
  return "help-circle";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  disclaimerBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#DBEAFE", borderRadius: RADIUS.md, marginBottom: 16, borderWidth: 1, borderColor: "#93C5FD" },
  disclaimerText: { flex: 1, color: "#1E3A8A", fontSize: 12, lineHeight: 16 },
  quizCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  quizIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  quizTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  quizMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  quizIntro: { color: COLORS.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 16 },
});
