/**
 * VoiceInput — TextInput avec bouton micro intégré (STT) et bouton haut-parleur (TTS).
 * À utiliser à la place d'un TextInput classique pour aider les mamans non-alphabétisées.
 *
 * Usage :
 *   <VoiceInput value={text} onChangeText={setText} placeholder="Décrivez vos symptômes…" />
 */
import { useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSpeechToText, speak, stopSpeaking } from "../lib/voice";
import { COLORS, RADIUS } from "../constants/theme";

type Props = {
  value: string;
  onChangeText: (txt: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
  language?: string;       // BCP-47, défaut "fr-FR"
  enableTTS?: boolean;     // afficher bouton haut-parleur (lit le texte saisi)
  enableSTT?: boolean;     // afficher bouton micro
  style?: any;
};

export default function VoiceInput({
  value, onChangeText, placeholder, multiline = false, testID,
  language = "fr-FR", enableTTS = true, enableSTT = true, style,
}: Props) {
  const stt = useSpeechToText();

  // Quand le STT enregistre du texte → l'ajoute au champ
  useEffect(() => {
    if (stt.transcript) {
      onChangeText((value ? value + " " : "") + stt.transcript);
      stt.reset();
    }
  }, [stt.transcript]);

  const onMicPress = () => {
    if (!stt.isSupported) {
      Alert.alert(
        "🎤 Dictée vocale",
        Platform.OS === "web"
          ? "Votre navigateur ne supporte pas la reconnaissance vocale. Essayez Chrome/Edge."
          : "Disponible uniquement sur navigateur web pour le moment. La version mobile arrive bientôt.",
      );
      return;
    }
    if (stt.isListening) {
      stt.stop();
    } else {
      stt.start(language);
    }
  };

  const onSpeakerPress = () => {
    if (!value || !value.trim()) {
      Alert.alert("Rien à lire", "Tapez ou dictez un texte d'abord.");
      return;
    }
    speak(value, { language });
  };

  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        value={value + (stt.interim ? " " + stt.interim : "")}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        testID={testID}
      />
      <View style={styles.buttonsRow}>
        {enableSTT && (
          <TouchableOpacity
            onPress={onMicPress}
            style={[styles.iconBtn, stt.isListening && styles.iconBtnActive]}
            testID={`${testID || "voice"}-mic`}
          >
            <Ionicons
              name={stt.isListening ? "mic-off" : "mic"}
              size={20}
              color={stt.isListening ? "#fff" : "#10B981"}
            />
          </TouchableOpacity>
        )}
        {enableTTS && (
          <TouchableOpacity
            onPress={onSpeakerPress}
            onLongPress={() => stopSpeaking()}
            style={styles.iconBtn}
            testID={`${testID || "voice"}-speaker`}
          >
            <Ionicons name="volume-high" size={20} color="#3B82F6" />
          </TouchableOpacity>
        )}
      </View>
      {stt.isListening && (
        <View style={styles.statusBar}>
          <View style={styles.dotPulse} />
          <Text style={styles.statusText}>🎤 Écoute en cours… parlez clairement</Text>
        </View>
      )}
      {stt.error && (
        <Text style={styles.errorText}>{stt.error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, overflow: "hidden" },
  input: { padding: 12, fontSize: 14, color: COLORS.textPrimary, paddingRight: 92 },
  buttonsRow: { position: "absolute", right: 8, top: 8, flexDirection: "row", gap: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  iconBtnActive: { backgroundColor: "#EF4444" },
  statusBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FEF3C7", borderTopWidth: 1, borderTopColor: "#FDE68A" },
  dotPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  statusText: { fontSize: 11, color: "#92400E", fontWeight: "700" },
  errorText: { fontSize: 11, color: "#EF4444", padding: 8 },
});
