/**
 * VoiceQA — Composant accessibilité pour les questionnaires DMP / TND.
 *
 * - 🔊 Lit la question à voix haute (TTS expo-speech, FR)
 * - 🎤 Capture la réponse vocale "oui" / "non" (STT expo-speech-recognition, FR)
 * - Détection tolérante : "oui, voilà", "ouais", "yes" → oui · "non, pas du tout" → non
 * - Bouton "Tout lire en boucle" pour mode mains libres pendant qu'on s'occupe du bébé
 *
 * Fonctionne sur iOS / Android / Web (Web Speech API via expo-speech-recognition).
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { COLORS, RADIUS } from "../constants/theme";

type Props = {
  /** Texte à lire / question à entendre. */
  question: string;
  /** Préfixe optionnel lu avant la question (ex: "Question 3 sur 20"). */
  prefix?: string;
  /** Callback quand l'utilisateur dit "oui". */
  onYes?: () => void;
  /** Callback quand l'utilisateur dit "non". */
  onNo?: () => void;
  /** Si vrai, lit automatiquement la question dès le montage. */
  autoRead?: boolean;
  /** Couleur principale du bouton. */
  color?: string;
  /** Mode compact (icônes seules, pas de label). */
  compact?: boolean;
};

// Détection tolérante des intentions oui/non en français/dioula
function detectIntent(text: string): "oui" | "non" | null {
  const t = (text || "").toLowerCase().trim();
  if (!t) return null;
  // OUI : oui, ouais, voui, yes, awo (dioula), c'est ça
  if (/\b(oui|ouais|voui|yes|awo|nan( bien sûr)?|d'accord|absolument|tout à fait|exact|effectivement|bien sûr|évidemment|c['']?est ça|c['']?est cela|si|exactement)\b/i.test(t)) return "oui";
  // NON : non, no, pas du tout, jamais, ayi (dioula), ay
  if (/\b(non|no|ay|ayi|pas du tout|jamais|absolument pas|pas vraiment|nope|nan|nein|du tout)\b/i.test(t)) return "non";
  return null;
}

export default function VoiceQA({
  question,
  prefix,
  onYes,
  onNo,
  autoRead = false,
  color = COLORS.primary,
  compact = false,
}: Props) {
  const [reading, setReading] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string>("");
  const stoppedRef = useRef(false);

  // Auto-lecture quand la question change
  useEffect(() => {
    if (autoRead) {
      const t = setTimeout(() => speak(), 250);
      return () => {
        clearTimeout(t);
        Speech.stop();
        try { ExpoSpeechRecognitionModule.stop(); } catch {}
      };
    }
    return () => { Speech.stop(); try { ExpoSpeechRecognitionModule.stop(); } catch {} };
  }, [question]);

  // Événements STT
  useSpeechRecognitionEvent("result", (e: any) => {
    const txt = e?.results?.[0]?.transcript || "";
    setHeard(txt);
    if (e?.isFinal) {
      const intent = detectIntent(txt);
      if (intent === "oui") { onYes?.(); stopListen(); }
      else if (intent === "non") { onNo?.(); stopListen(); }
    }
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (e: any) => {
    setListening(false);
    if (!stoppedRef.current && e?.error !== "no-speech" && e?.error !== "aborted") {
      // évite les popups intempestifs
    }
  });

  const speak = () => {
    if (reading) { Speech.stop(); setReading(false); return; }
    setReading(true);
    const txt = (prefix ? `${prefix}. ` : "") + question + " Répondez par oui ou par non.";
    Speech.speak(txt, {
      language: "fr-FR",
      rate: 0.92,
      onDone: () => setReading(false),
      onStopped: () => setReading(false),
      onError: () => setReading(false),
    });
  };

  const startListen = async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        return Alert.alert(
          "Microphone requis",
          "Activez l'accès au microphone dans les réglages pour utiliser le mode vocal."
        );
      }
      stoppedRef.current = false;
      setHeard("");
      setListening(true);
      Speech.stop();
      await ExpoSpeechRecognitionModule.start({
        lang: "fr-FR",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
      });
    } catch (e: any) {
      setListening(false);
      Alert.alert("Mode vocal indisponible", e?.message || "Impossible de démarrer la reconnaissance vocale.");
    }
  };

  const stopListen = () => {
    stoppedRef.current = true;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setListening(false);
  };

  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <TouchableOpacity
        style={[s.btn, { borderColor: color }, reading && { backgroundColor: color }]}
        onPress={speak}
        accessibilityLabel={reading ? "Arrêter la lecture" : "Écouter la question"}
      >
        <Ionicons name={reading ? "stop-circle" : "volume-high"} size={compact ? 18 : 20} color={reading ? "#fff" : color} />
        {!compact && <Text style={[s.btnTxt, { color: reading ? "#fff" : color }]}>{reading ? "Arrêter" : "Écouter"}</Text>}
      </TouchableOpacity>

      {(onYes || onNo) && (
        <TouchableOpacity
          style={[s.btn, { borderColor: color }, listening && { backgroundColor: "#DC2626", borderColor: "#DC2626" }]}
          onPress={listening ? stopListen : startListen}
          accessibilityLabel={listening ? "Arrêter l'écoute" : "Répondre à la voix"}
        >
          <Ionicons name={listening ? "stop-circle" : "mic"} size={compact ? 18 : 20} color={listening ? "#fff" : color} />
          {!compact && <Text style={[s.btnTxt, { color: listening ? "#fff" : color }]}>{listening ? "Écoute…" : "Parler"}</Text>}
        </TouchableOpacity>
      )}

      {listening && !!heard && (
        <Text style={s.heard} numberOfLines={1}>“{heard}”</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  wrapCompact: { gap: 6 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1.5, backgroundColor: "transparent" },
  btnTxt: { fontWeight: "700", fontSize: 13 },
  heard: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic", marginLeft: 4, maxWidth: 180 },
});
