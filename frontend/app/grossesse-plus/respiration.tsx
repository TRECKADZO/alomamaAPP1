import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Respiration() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [cycles, setCycles] = useState(0);
  const intervalRef = useRef<any>(null);
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    api.get("/grossesse-plus/breathing").then(r => setExercises(r.data));
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      scale.setValue(0.5);
      return;
    }
    const step = active.steps[phaseIdx];
    setRemaining(step.seconds);
    // Animation
    const target = step.phase.toLowerCase().includes("inspir") ? 1 : step.phase.toLowerCase().includes("expir") ? 0.5 : scale.__getValue();
    Animated.timing(scale, { toValue: target, duration: step.seconds * 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current);
          const next = phaseIdx + 1;
          if (next >= active.steps.length) {
            setCycles(c => c + 1);
            setPhaseIdx(0);
          } else {
            setPhaseIdx(next);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active, phaseIdx]);

  const stop = () => { setActive(null); setPhaseIdx(0); setCycles(0); };

  if (active) {
    const step = active.steps[phaseIdx];
    return (
      <SafeAreaView style={[s.container, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={s.activeIcon}>{active.icon}</Text>
        <Text style={s.activeTitle}>{active.title}</Text>
        <Animated.View style={[s.breathBall, { transform: [{ scale }] }]} />
        <Text style={s.phase}>{step.phase}</Text>
        <Text style={s.remaining}>{remaining}s</Text>
        <Text style={s.cycles}>Cycles terminés : {cycles}</Text>
        <TouchableOpacity style={s.stopBtn} onPress={stop}>
          <Ionicons name="stop" size={20} color="#fff" />
          <Text style={s.stopTxt}>Arrêter</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <Text style={s.intro}>Apaisez-vous et préparez votre corps avec ces exercices guidés.</Text>
        {exercises.map(ex => (
          <TouchableOpacity key={ex.id} style={s.card} onPress={() => { setPhaseIdx(0); setCycles(0); setActive(ex); }}>
            <View style={s.cardIcon}>
              <Text style={{ fontSize: 30 }}>{ex.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{ex.title}</Text>
              <Text style={s.cardDesc}>{ex.description}</Text>
              <Text style={s.cardDur}>⏱️ {ex.duration_min} min</Text>
            </View>
            <Ionicons name="play-circle" size={32} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  intro: { color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  cardIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryLight },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  cardDesc: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  cardDur: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  activeIcon: { fontSize: 50, marginBottom: 10 },
  activeTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 30 },
  breathBall: { width: 200, height: 200, borderRadius: 100, backgroundColor: COLORS.primary + "33", borderWidth: 3, borderColor: COLORS.primary, marginBottom: 30 },
  phase: { fontSize: 22, fontWeight: "800", color: COLORS.primary, marginBottom: 6 },
  remaining: { fontSize: 42, fontWeight: "800", color: COLORS.textPrimary, fontVariant: ["tabular-nums"], marginBottom: 10 },
  cycles: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 30 },
  stopBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: COLORS.error, borderRadius: RADIUS.pill },
  stopTxt: { color: "#fff", fontWeight: "800" },
});
