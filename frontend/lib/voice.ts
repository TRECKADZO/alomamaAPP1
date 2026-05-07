/**
 * Voice utilities — TTS (Text-to-Speech) + STT (Speech-to-Text)
 * =============================================================
 * - speak(text, opts) — TTS via expo-speech (cross-platform)
 * - useSpeechToText() — STT hook
 *     • Web : Web Speech API (window.SpeechRecognition / webkitSpeechRecognition)
 *     • Mobile : retourne `supported=false` (nécessite un dev build avec
 *       @react-native-voice/voice ou expo-speech-recognition pour activation native)
 *
 * 🌍 Langues supportées : fr-FR par défaut. La transcription côté pédiatrique
 * permet aux mamans francophones de saisir des notes/champs sans clavier.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";

// ============================================================================
// TTS
// ============================================================================
type SpeakOptions = {
  language?: string; // BCP-47 ex: "fr-FR"
  rate?: number;     // 0.5 → 2.0, défaut 1.0
  pitch?: number;    // 0.5 → 2.0
  onDone?: () => void;
  onError?: (e: any) => void;
};

export async function speak(text: string, opts: SpeakOptions = {}) {
  if (!text) return;
  try {
    Speech.stop();
    Speech.speak(text, {
      language: opts.language || "fr-FR",
      rate: opts.rate ?? 1.0,
      pitch: opts.pitch ?? 1.0,
      onDone: opts.onDone,
      onError: opts.onError,
    });
  } catch (e: any) {
    opts.onError?.(e);
  }
}

export function stopSpeaking() {
  try { Speech.stop(); } catch {}
}

// ============================================================================
// STT
// ============================================================================
export type SpeechToTextResult = {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interim: string;
  error: string | null;
  start: (language?: string) => void;
  stop: () => void;
  reset: () => void;
};

export function useSpeechToText(): SpeechToTextResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const isSupported = Platform.OS === "web" && typeof window !== "undefined" && (
    !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  );

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback((language: string = "fr-FR") => {
    if (!isSupported) {
      setError("Reconnaissance vocale non supportée sur cette plateforme");
      return;
    }
    cleanup();
    setError(null);
    setTranscript("");
    setInterim("");

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let final = "";
      let inter = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else inter += r[0].transcript;
      }
      if (final) setTranscript((t) => (t ? t + " " : "") + final.trim());
      setInterim(inter);
    };

    rec.onerror = (e: any) => {
      setError(e?.error || "Erreur de reconnaissance");
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.onstart = () => {
      setIsListening(true);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (e: any) {
      setError(e?.message || "Démarrage impossible");
    }
  }, [isSupported, cleanup]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { isSupported, isListening, transcript, interim, error, start, stop, reset };
}
