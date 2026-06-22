/**
 * Check-in hebdomadaire "Et toi, comment tu vas ?" — wizard 4 étapes
 * Step 1: Mood (1-5)
 * Step 2: Symptômes physiques (chips)
 * Step 3: Symptômes mentaux (chips)
 * Step 4: Texte libre + mode vocal (VoiceQA n'est pas adapté pour texte libre, on utilise expo-speech-recognition direct)
 */
import { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { smartPost } from "../../lib/offline";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const MOODS = [
  { v: 1, emoji: "😭", label: "Très mal" },
  { v: 2, emoji: "😟", label: "Pas top" },
  { v: 3, emoji: "😐", label: "Bof" },
  { v: 4, emoji: "😊", label: "Bien" },
  { v: 5, emoji: "😄", label: "Très bien" },
];
const PHYSICAL = ["fatigue intense","mal de dos","douleurs périnéales","douleurs cicatrice césarienne","saignements abondants","fièvre","chute de cheveux","sécheresse intime","incontinence urinaire","constipation","hémorroïdes","engorgement seins","crevasses allaitement","vergetures démangeant","perte de poids rapide","prise de poids"];
const MENTAL = ["tristesse persistante","pleurs sans raison","irritabilité","anxiété forte","insomnie","pensées sombres","sentiment de vide","culpabilité excessive","perte d'intérêt pour bébé","baisse de libido","isolement social","honte de soi"];

export default function Checkin() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState(3);
  const [phys, setPhys] = useState<string[]>([]);
  const [ment, setMent] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [partage, setPartage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [listening, setListening] = useState(false);

  useSpeechRecognitionEvent("result", (e: any) => {
    const t = e?.results?.[0]?.transcript || "";
    if (e?.isFinal) setText(prev => (prev ? prev + " " : "") + t);
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", () => setListening(false));

  useEffect(() => () => { Speech.stop(); try { ExpoSpeechRecognitionModule.stop(); } catch {} }, []);

  // Auto-read question "Et toi, comment tu vas ?" à l'étape 4
  useEffect(() => {
    if (step === 3) {
      const t = setTimeout(() => {
        Speech.speak("Et toi, comment tu vas ? Parle-moi librement, je t'écoute.", { language: "fr-FR", rate: 0.95, onDone: () => setReading(false) });
        setReading(true);
      }, 300);
      return () => { clearTimeout(t); Speech.stop(); };
    }
  }, [step]);

  const startListen = async () => {
    try {
      const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!p.granted) return Alert.alert("Micro requis", "Autorisez le microphone dans les réglages.");
      setListening(true);
      Speech.stop();
      await ExpoSpeechRecognitionModule.start({ lang: "fr-FR", interimResults: true, continuous: true, maxAlternatives: 1, addsPunctuation: true });
    } catch (e: any) {
      setListening(false);
      Alert.alert("Erreur", e?.message || "Mode vocal indisponible");
    }
  };
  const stopListen = () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} setListening(false); };

  const togglePhys = (s: string) => setPhys(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleMent = (s: string) => setMent(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const submit = async () => {
    try {
      setBusy(true);
      const r = await smartPost("/postpartum/checkin", {
        mood, physical_symptoms: phys, mental_symptoms: ment, free_text: text, consent_partage_pro: partage,
      });
      const alerts = r.data?.alerts || [];
      const hasCrit = alerts.some((a: any) => a.level === "critical");
      if (hasCrit) {
        Alert.alert(
          "💗 Vous méritez un soutien maintenant",
          alerts.find((a: any) => a.level === "critical")?.message || "Parlez-en à quelqu'un.",
          [{ text: "Voir mon tableau de bord", onPress: () => router.replace("/postpartum" as any) }]
        );
      } else {
        Alert.alert("✨ Merci", `Votre check-in a été enregistré.${alerts.length ? " Quelques recommandations vous attendent." : ""}`, [
          { text: "OK", onPress: () => router.replace("/postpartum" as any) },
        ]);
      }
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
        </View>
        <ScrollView contentContainerStyle={s.scroll}>
          {step === 0 && (
            <View>
              <Text style={s.q}>Aujourd'hui, comment te sens-tu ?</Text>
              <Text style={s.sub}>Il n'y a pas de mauvaise réponse 💗</Text>
              <View style={s.moodRow}>
                {MOODS.map(m => (
                  <TouchableOpacity key={m.v} style={[s.moodBtn, mood === m.v && s.moodOn]} onPress={() => setMood(m.v)}>
                    <Text style={{ fontSize: 36 }}>{m.emoji}</Text>
                    <Text style={[s.moodLbl, mood === m.v && { color: "#fff" }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {step === 1 && (
            <View>
              <Text style={s.q}>Symptômes physiques ?</Text>
              <Text style={s.sub}>Coche ce qui te concerne (rien de grave par défaut)</Text>
              <View style={s.chips}>
                {PHYSICAL.map(p => (
                  <TouchableOpacity key={p} style={[s.chip, phys.includes(p) && s.chipOn]} onPress={() => togglePhys(p)}>
                    <Text style={[s.chipTxt, phys.includes(p) && s.chipTxtOn]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {step === 2 && (
            <View>
              <Text style={s.q}>Symptômes émotionnels ?</Text>
              <Text style={s.sub}>Ces ressentis sont normaux. Coche ce qui te parle.</Text>
              <View style={s.chips}>
                {MENTAL.map(p => (
                  <TouchableOpacity key={p} style={[s.chip, ment.includes(p) && s.chipOnP]} onPress={() => toggleMent(p)}>
                    <Text style={[s.chipTxt, ment.includes(p) && s.chipTxtOn]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {step === 3 && (
            <View>
              <Text style={s.q}>Et toi, comment tu vas ?</Text>
              <Text style={s.sub}>Parle-moi librement, par texte ou par la voix 🎙️</Text>
              <View style={s.voiceCtl}>
                <TouchableOpacity style={[s.voiceBtn, reading && s.voiceBtnOn]} onPress={() => { if (reading) { Speech.stop(); setReading(false); } else { Speech.speak("Et toi, comment tu vas ? Parle-moi librement", { language: "fr-FR", onDone: () => setReading(false) }); setReading(true); } }}>
                  <Ionicons name={reading ? "stop-circle" : "volume-high"} size={18} color={reading ? "#fff" : "#EC4899"} />
                  <Text style={[s.voiceTxt, reading && { color: "#fff" }]}>{reading ? "Stop" : "Écouter"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.voiceBtn, listening && { backgroundColor: "#DC2626", borderColor: "#DC2626" }]} onPress={listening ? stopListen : startListen}>
                  <Ionicons name={listening ? "stop-circle" : "mic"} size={18} color={listening ? "#fff" : "#EC4899"} />
                  <Text style={[s.voiceTxt, listening && { color: "#fff" }]}>{listening ? "Écoute…" : "Parler"}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={s.textArea}
                value={text}
                onChangeText={setText}
                multiline
                placeholder="Écris ce que tu veux, comme tu veux. Tout est valable."
                placeholderTextColor={COLORS.textMuted}
              />
              <View style={s.consentRow}>
                <Switch value={partage} onValueChange={setPartage} trackColor={{ false: COLORS.border, true: "#EC4899" }} thumbColor="#fff" />
                <Text style={s.consentTxt}>J'accepte que ma sage-femme/médecin puisse voir ce check-in si je le partage explicitement (consentement révocable).</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity style={[s.navBtn, step === 0 && s.disabled]} onPress={() => step > 0 && setStep(step - 1)} disabled={step === 0}>
            <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
            <Text style={s.navTxt}>Retour</Text>
          </TouchableOpacity>
          {step < 3 ? (
            <TouchableOpacity style={[s.navBtn, s.navBtnPrimary]} onPress={() => setStep(step + 1)}>
              <Text style={[s.navTxt, { color: "#fff" }]}>Suivant</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.navBtn, s.submitBtn, busy && s.disabled]} onPress={submit} disabled={busy}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={[s.navTxt, { color: "#fff" }]}>{busy ? "Envoi..." : "Valider"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  progressBar: { height: 4, backgroundColor: "#FCE7F3" },
  progressFill: { height: "100%", backgroundColor: "#EC4899" },
  scroll: { padding: SPACING.lg, paddingBottom: 100 },
  q: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  sub: { color: COLORS.textSecondary, marginBottom: 18, lineHeight: 18 },
  moodRow: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  moodBtn: { flex: 1, padding: 12, alignItems: "center", backgroundColor: "#fff", borderRadius: RADIUS.md, borderWidth: 2, borderColor: "transparent" },
  moodOn: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  moodLbl: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700", marginTop: 4, textAlign: "center" },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  chipOnP: { backgroundColor: "#9333EA", borderColor: "#9333EA" },
  chipTxt: { color: COLORS.textSecondary, fontSize: 12 },
  chipTxtOn: { color: "#fff", fontWeight: "700" },
  voiceCtl: { flexDirection: "row", gap: 10, marginBottom: 12 },
  voiceBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: "#EC4899", backgroundColor: "#fff" },
  voiceBtnOn: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  voiceTxt: { color: "#EC4899", fontWeight: "800", fontSize: 13 },
  textArea: { backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, minHeight: 140, color: COLORS.textPrimary, textAlignVertical: "top" },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 14, padding: 12, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md },
  consentTxt: { flex: 1, color: "#831843", fontSize: 11, lineHeight: 16 },
  footer: { flexDirection: "row", gap: 10, padding: SPACING.lg, backgroundColor: "#FDF2F8", borderTopWidth: 1, borderTopColor: "#FCE7F3" },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, borderRadius: RADIUS.md, backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border },
  navBtnPrimary: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  submitBtn: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  navTxt: { fontWeight: "800", color: COLORS.textPrimary },
  disabled: { opacity: 0.4 },
});
