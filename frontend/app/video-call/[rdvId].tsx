/**
 * Téléconsultation HD Agora.io — À lo Maman
 * - Optimisée Afrique de l'Ouest (Edge nodes Lagos)
 * - Fallback automatique vers Jitsi si module natif indisponible (Expo Go / web)
 * - Contrôles : Mute, Caméra On/Off, Switch caméra, Raccrocher
 * - Indicateur de qualité réseau
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, Linking, ScrollView, AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { api, formatError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import {
  AgoraSDK,
  RtcSurfaceView,
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
} from "../../lib/agora";

// ----- Détection environnement (Expo Go ne supporte PAS les modules natifs) -----
const isExpoGo = Constants.appOwnership === "expo";
const isWeb = Platform.OS === "web";
// AgoraSDK est null sur web ; sur iOS/Android, il est résolu via lib/agora.native.ts
// mais Expo Go n'inclut pas le code natif (besoin d'un dev build / production build).
const _agoraInExpoGo = isExpoGo;

// Permissions Android
async function requestPermissions() {
  if (Platform.OS !== "android") return;
  try {
    const { PermissionsAndroid } = require("react-native");
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.CAMERA,
    ]);
  } catch (e) { console.warn("perm err", e); }
}

interface AgoraToken {
  app_id: string;
  channel: string;
  token: string;
  uid: number;
}

export default function VideoCall() {
  const { rdvId } = useLocalSearchParams<{ rdvId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [rdv, setRdv] = useState<any | null>(null);
  const [inCall, setInCall] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<number>(0); // 0=unknown 1=excellent 6=down
  const [callDuration, setCallDuration] = useState(0);
  const [agoraReady, setAgoraReady] = useState(false);

  const engineRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const isPro = user?.role === "professionnel";
  const isMaman = user?.role === "maman";

  // Charger les détails du RDV
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/rdv");
        const found = (r.data || []).find((x: any) => x.id === rdvId);
        setRdv(found || null);
      } catch {}
    })();
  }, [rdvId]);

  // Cleanup auto à la sortie
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && inCall) {
        // En arrière-plan : couper la caméra mais garder l'audio (mode appel)
        try { engineRef.current?.muteLocalVideoStream(true); } catch {}
      }
    });
    return () => {
      sub.remove();
      cleanupCall();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCall]);

  // Compteur de durée d'appel
  useEffect(() => {
    if (inCall) {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [inCall]);

  const cleanupCall = useCallback(() => {
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
    } catch {}
    engineRef.current = null;
    setInCall(false);
    setRemoteUid(null);
    setAgoraReady(false);
  }, []);

  // ---- Démarrer l'appel via Agora ----
  const startAgoraCall = async () => {
    if (!rdvId || !createAgoraRtcEngine) return;
    setLoading(true);
    try {
      await requestPermissions();

      // 1. Récupérer le token sécurisé
      const { data } = await api.post(`/teleconsultation/agora-token/${rdvId}`);
      const info: AgoraToken = data;

      // 2. Initialiser le moteur
      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: info.app_id,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      // 3. Enregistrer les events
      engine.registerEventHandler({
        onJoinChannelSuccess: () => {
          setAgoraReady(true);
          setInCall(true);
          setLoading(false);
        },
        onUserJoined: (_conn: any, uid: number) => {
          setRemoteUid(uid);
        },
        onUserOffline: () => {
          setRemoteUid(null);
        },
        onError: (err: any, msg: string) => {
          console.warn("Agora error", err, msg);
        },
        onNetworkQuality: (_conn: any, _uid: number, txQuality: number) => {
          setNetworkQuality(txQuality);
        },
        onLeaveChannel: () => {
          setInCall(false);
          setRemoteUid(null);
        },
      });

      // 4. Activer audio + vidéo
      engine.enableVideo();
      engine.enableAudio();
      engine.startPreview();
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);

      // 5. Rejoindre le canal
      engine.joinChannel(info.token, info.channel, info.uid, {});
    } catch (e: any) {
      Alert.alert("Erreur Agora", formatError(e));
      setLoading(false);
      cleanupCall();
    }
  };

  // ---- Fallback Jitsi (Expo Go / web) ----
  const startJitsiCall = async () => {
    if (!rdvId) return Alert.alert("Erreur", "Identifiant du RDV manquant");
    setLoading(true);
    try {
      const { data } = await api.post(`/teleconsultation/room/${rdvId}`);
      await Linking.openURL(data.room_url);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setLoading(false); }
  };

  // ---- Contrôles d'appel ----
  const toggleMute = () => {
    if (!engineRef.current) return;
    engineRef.current.muteLocalAudioStream(!muted);
    setMuted(!muted);
  };

  const toggleCamera = () => {
    if (!engineRef.current) return;
    engineRef.current.muteLocalVideoStream(!cameraOff);
    setCameraOff(!cameraOff);
  };

  const switchCamera = () => {
    if (!engineRef.current) return;
    try { engineRef.current.switchCamera(); } catch {}
  };

  const endCall = () => {
    Alert.alert("Terminer la consultation ?", "L'appel sera déconnecté", [
      { text: "Annuler", style: "cancel" },
      { text: "Raccrocher", style: "destructive", onPress: () => { cleanupCall(); router.back(); } },
    ]);
  };

  // ---- UI - Format duration ----
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const networkColor = networkQuality === 0 ? "#9CA3AF" :
    networkQuality <= 2 ? "#10B981" :
    networkQuality <= 4 ? "#F59E0B" : "#EF4444";
  const networkLabel = networkQuality === 0 ? "..." :
    networkQuality <= 2 ? "Excellent" :
    networkQuality <= 4 ? "Moyen" : "Faible";

  // ===== EN APPEL : interface plein écran =====
  if (inCall && agoraReady && AgoraSDK) {
    return (
      <View style={styles.callContainer}>
        {/* Vidéo distante (plein écran) */}
        {remoteUid ? (
          <RtcSurfaceView
            style={StyleSheet.absoluteFillObject}
            canvas={{ uid: remoteUid }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.waitingScreen]}>
            <LinearGradient colors={["#0F172A", "#1E293B"]} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="videocam" size={80} color="#64748B" />
            <Text style={styles.waitingText}>En attente de l&apos;autre participant…</Text>
            <Text style={styles.waitingSub}>{isPro ? "La patiente va rejoindre la salle" : "Le praticien va rejoindre la salle"}</Text>
            <ActivityIndicator color="#06B6D4" style={{ marginTop: 16 }} />
          </View>
        )}

        {/* Vidéo locale (PIP en haut à droite) */}
        {!cameraOff && (
          <View style={styles.localVideoBox}>
            <RtcSurfaceView
              style={styles.localVideo}
              canvas={{ uid: 0 }}
            />
          </View>
        )}
        {cameraOff && (
          <View style={styles.localVideoBox}>
            <View style={[styles.localVideo, styles.cameraOffBox]}>
              <Ionicons name="videocam-off" size={28} color="#fff" />
            </View>
          </View>
        )}

        {/* Header overlay */}
        <SafeAreaView edges={["top"]} style={styles.callHeader} pointerEvents="box-none">
          <View style={styles.callHeaderRow}>
            <View style={styles.qualityChip}>
              <View style={[styles.qualityDot, { backgroundColor: networkColor }]} />
              <Text style={styles.qualityText}>{networkLabel}</Text>
            </View>
            <View style={styles.durationChip}>
              <Ionicons name="time-outline" size={12} color="#fff" />
              <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
            </View>
          </View>
        </SafeAreaView>

        {/* Footer contrôles */}
        <SafeAreaView edges={["bottom"]} style={styles.controlsBar}>
          <View style={styles.controlsRow}>
            <TouchableOpacity onPress={toggleMute} style={[styles.ctrlBtn, muted && styles.ctrlBtnActive]}>
              <Ionicons name={muted ? "mic-off" : "mic"} size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleCamera} style={[styles.ctrlBtn, cameraOff && styles.ctrlBtnActive]}>
              <Ionicons name={cameraOff ? "videocam-off" : "videocam"} size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={switchCamera} style={styles.ctrlBtn}>
              <Ionicons name="camera-reverse" size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={endCall} style={[styles.ctrlBtn, styles.endBtn]}>
              <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ===== ÉCRAN D'ACCUEIL (avant l'appel) =====
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Téléconsultation</Text>
          <Text style={styles.sub}>
            {AgoraSDK ? "Visio HD sécurisée — Agora" : "Visio sécurisée — Jitsi (mode développement)"}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.iconBig}>
          <Ionicons name="videocam" size={56} color="#fff" />
        </LinearGradient>

        {rdv ? (
          <View style={styles.rdvCard}>
            <Text style={styles.rdvLabel}>RDV programmé</Text>
            <Text style={styles.rdvDate}>
              {new Date(rdv.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {" · "}
              {new Date(rdv.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text style={styles.rdvMotif}>{rdv.motif}</Text>
            <View style={styles.statusBadge}>
              <Ionicons name={rdv.status === "confirme" ? "checkmark-circle" : "time"} size={14} color={rdv.status === "confirme" ? "#16A34A" : "#F59E0B"} />
              <Text style={[styles.statusText, { color: rdv.status === "confirme" ? "#16A34A" : "#F59E0B" }]}>
                {rdv.status === "confirme" ? "Confirmé" : rdv.status === "en_attente" ? "En attente" : rdv.status}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.bigTitle}>
          {isPro ? "Démarrer la consultation" : "Rejoindre la consultation"}
        </Text>
        <Text style={styles.bigSub}>
          {AgoraSDK
            ? "Vidéo HD optimisée pour les réseaux mobiles 3G+. Chiffrement bout-en-bout."
            : "L'appel sera ouvert dans le navigateur (mode développement)."}
        </Text>

        {/* Avertissement Expo Go */}
        {!AgoraSDK && (
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={18} color="#F59E0B" />
            <Text style={styles.warningText}>
              Vous êtes en mode Expo Go. La vidéo HD Agora sera disponible dans la version build (APK).
              Pour l&apos;instant, l&apos;appel s&apos;ouvre via Jitsi.
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={AgoraSDK ? startAgoraCall : startJitsiCall}
          disabled={loading}
          style={{ marginTop: 24, alignSelf: "stretch" }}
          testID="start-call-btn"
        >
          <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btn}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="videocam" size={20} color="#fff" />
                <Text style={styles.btnText}>{isPro ? "Démarrer la consultation" : "Rejoindre la salle"}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Conseils */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>📋 Avant de commencer</Text>
          <Tip icon="wifi" text="Vérifiez votre connexion Internet (3G minimum)" />
          <Tip icon="mic" text="Autorisez l'accès au micro et à la caméra" />
          <Tip icon="headset" text="Utilisez un casque audio pour éviter l'écho" />
          <Tip icon="moon" text="Choisissez un endroit calme et bien éclairé" />
          {isMaman && <Tip icon="document-text" text="Préparez vos questions et votre carnet de santé" />}
          {isPro && <Tip icon="shield-checkmark" text="Confidentialité : aucun enregistrement par défaut" />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  body: { padding: SPACING.xl, alignItems: "center" },
  iconBig: { width: 110, height: 110, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  rdvCard: { width: "100%", backgroundColor: COLORS.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  rdvLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: "700", textTransform: "uppercase" },
  rdvDate: { fontSize: 14, color: COLORS.textPrimary, fontWeight: "800", marginTop: 4 },
  rdvMotif: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: COLORS.bgPrimary },
  statusText: { fontSize: 11, fontWeight: "800" },
  bigTitle: { fontSize: 21, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center", marginTop: 8 },
  bigSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, paddingHorizontal: 10 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 16, borderRadius: RADIUS.pill },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  warningBox: { flexDirection: "row", gap: 8, marginTop: 16, padding: 12, backgroundColor: "#FEF3C7", borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A" },
  warningText: { flex: 1, fontSize: 12, color: "#78350F", lineHeight: 17 },
  tipsBox: { width: "100%", padding: 14, backgroundColor: "#EFF6FF", borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE", marginTop: 24 },
  tipsTitle: { fontSize: 14, fontWeight: "800", color: "#1E40AF", marginBottom: 8 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  tipText: { flex: 1, fontSize: 12, color: "#1E40AF" },

  // ===== Call mode plein écran =====
  callContainer: { flex: 1, backgroundColor: "#000" },
  waitingScreen: { alignItems: "center", justifyContent: "center" },
  waitingText: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 16 },
  waitingSub: { color: "#94A3B8", fontSize: 13, marginTop: 6 },
  localVideoBox: { position: "absolute", top: 60, right: 16, width: 110, height: 160, borderRadius: 14, overflow: "hidden", borderWidth: 2, borderColor: "#fff", elevation: 6 },
  localVideo: { flex: 1, width: "100%" },
  cameraOffBox: { backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center" },
  callHeader: { position: "absolute", top: 0, left: 0, right: 0 },
  callHeaderRow: { flexDirection: "row", justifyContent: "space-between", padding: 16 },
  qualityChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999 },
  qualityDot: { width: 8, height: 8, borderRadius: 4 },
  qualityText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  durationChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999 },
  durationText: { color: "#fff", fontSize: 12, fontWeight: "700", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  controlsBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  controlsRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", padding: 16 },
  ctrlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  ctrlBtnActive: { backgroundColor: "#EF4444" },
  endBtn: { backgroundColor: "#DC2626" },
});
