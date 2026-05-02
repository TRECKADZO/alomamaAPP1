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

  // Fenêtre temporelle (statut & countdown)
  const [windowInfo, setWindowInfo] = useState<any>(null);
  const [windowLoaded, setWindowLoaded] = useState(false);
  // Diagnostic des push tokens (savoir si la maman/pro recevra la sonnerie)
  const [diagInfo, setDiagInfo] = useState<any>(null);

  const engineRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const statusPollRef = useRef<any>(null);

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

  // Polling du statut de la fenêtre temporelle (toutes les 5s)
  useEffect(() => {
    if (!rdvId) return;
    const fetchStatus = async () => {
      try {
        const r = await api.get(`/teleconsultation/status/${rdvId}`);
        setWindowInfo(r.data);
      } catch {
      } finally {
        setWindowLoaded(true);
      }
    };
    // Diagnostic une seule fois (push tokens des 2 participants)
    const fetchDiag = async () => {
      try {
        const r = await api.get(`/teleconsultation/diagnostic/${rdvId}`);
        setDiagInfo(r.data);
      } catch {}
    };
    fetchStatus();
    fetchDiag();
    statusPollRef.current = setInterval(fetchStatus, 5000); // refresh chaque 5s
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [rdvId]);

  // Cleanup uniquement à l'unmount du composant (pas à chaque inCall change !)
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gestion AppState background : couper la caméra mais garder l'audio
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && inCall) {
        try { engineRef.current?.muteLocalVideoStream(true); } catch {}
      }
    });
    return () => sub.remove();
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

      // 6. Sonner l'autre participant (push notification avec deep link)
      // Fire-and-forget : on ne bloque pas l'entrée dans la salle si ça échoue.
      api.post(`/teleconsultation/ring/${rdvId}`).catch(() => {});
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
      // Sonner l'autre participant en parallèle (fire-and-forget)
      api.post(`/teleconsultation/ring/${rdvId}`).catch(() => {});
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

        {/* État de la fenêtre temporelle */}
        {windowLoaded && windowInfo && (
          <WindowStatusCard info={windowInfo} />
        )}

        {/* Avertissement push tokens : l'autre participant ne recevra pas la sonnerie */}
        {diagInfo && diagInfo.window?.available && !diagInfo.other_party_will_receive_ring && (
          <View style={styles.warnPushBox}>
            <Ionicons name="warning" size={18} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnPushTitle}>
                {isPro
                  ? `${diagInfo.maman?.name || "La patiente"} ne recevra pas la sonnerie`
                  : `${diagInfo.pro?.name || "Le professionnel"} ne recevra pas la sonnerie`}
              </Text>
              <Text style={styles.warnPushText}>
                {isPro
                  ? "Sa notification push n'est pas active. Contactez-la par téléphone et demandez-lui d'ouvrir l'application avant le RDV pour activer les notifications."
                  : "Sa notification push n'est pas active. Vous pouvez quand même rejoindre la salle directement."}
              </Text>
            </View>
          </View>
        )}

        {/* Bouton conditionnel selon la fenêtre */}
        {windowInfo?.available ? (
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
        ) : (
          <View style={[styles.btn, styles.btnDisabled]}>
            <Ionicons name="lock-closed" size={20} color="#94A3B8" />
            <Text style={styles.btnDisabledText}>
              {windowInfo?.status === "scheduled" ? "Salle pas encore ouverte" :
               windowInfo?.status === "closed" ? "Fenêtre terminée" :
               windowInfo?.status === "cancelled" ? "RDV annulé" :
               windowInfo?.status === "not_confirmed" ? "Non confirmé" :
               "Indisponible"}
            </Text>
          </View>
        )}

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

/**
 * Carte de statut de la fenêtre temporelle.
 * Affiche un compte à rebours en temps réel quand la salle n'est pas encore ouverte.
 */
function WindowStatusCard({ info }: { info: any }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (info?.status !== "scheduled") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [info?.status]);

  if (!info) return null;

  const status = info.status;
  if (status === "open") {
    return (
      <View style={[styles.windowCard, { backgroundColor: "#D1FAE5", borderColor: "#10B981" }]}>
        <Ionicons name="checkmark-circle" size={22} color="#059669" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.windowTitle, { color: "#065F46" }]}>Salle ouverte</Text>
          <Text style={[styles.windowText, { color: "#047857" }]}>{info.human}</Text>
        </View>
      </View>
    );
  }
  if (status === "scheduled") {
    // Compte à rebours en temps réel
    let secs = info.opens_at ? Math.max(0, Math.floor((new Date(info.opens_at).getTime() - now) / 1000)) : 0;
    const d = Math.floor(secs / 86400); secs -= d * 86400;
    const h = Math.floor(secs / 3600); secs -= h * 3600;
    const m = Math.floor(secs / 60); secs -= m * 60;
    const s = secs;
    let countdown = "";
    if (d > 0) countdown = `${d}j ${h}h ${m}min`;
    else if (h > 0) countdown = `${h}h ${m.toString().padStart(2, "0")}min`;
    else if (m > 0) countdown = `${m}min ${s.toString().padStart(2, "0")}s`;
    else countdown = `${s}s`;
    return (
      <View style={[styles.windowCard, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
        <Ionicons name="time" size={22} color="#B45309" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.windowTitle, { color: "#78350F" }]}>Salle pas encore ouverte</Text>
          <Text style={[styles.windowText, { color: "#92400E" }]}>Ouverture dans {countdown}</Text>
          <Text style={[styles.windowSub, { color: "#92400E" }]}>
            Vous pourrez rejoindre 15 minutes avant le RDV
          </Text>
        </View>
      </View>
    );
  }
  if (status === "closed") {
    return (
      <View style={[styles.windowCard, { backgroundColor: "#FEE2E2", borderColor: "#EF4444" }]}>
        <Ionicons name="close-circle" size={22} color="#B91C1C" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.windowTitle, { color: "#7F1D1D" }]}>Fenêtre terminée</Text>
          <Text style={[styles.windowText, { color: "#991B1B" }]}>{info.human}</Text>
        </View>
      </View>
    );
  }
  if (status === "cancelled") {
    return (
      <View style={[styles.windowCard, { backgroundColor: "#FEE2E2", borderColor: "#EF4444" }]}>
        <Ionicons name="ban" size={22} color="#B91C1C" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.windowTitle, { color: "#7F1D1D" }]}>RDV annulé</Text>
          <Text style={[styles.windowText, { color: "#991B1B" }]}>{info.human}</Text>
        </View>
      </View>
    );
  }
  if (status === "not_confirmed") {
    return (
      <View style={[styles.windowCard, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
        <Ionicons name="hourglass" size={22} color="#B45309" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.windowTitle, { color: "#78350F" }]}>En attente de confirmation</Text>
          <Text style={[styles.windowText, { color: "#92400E" }]}>{info.human}</Text>
        </View>
      </View>
    );
  }
  return null;
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
  btnDisabled: { backgroundColor: "#E2E8F0", borderRadius: RADIUS.pill, marginTop: 12, alignSelf: "stretch" },
  btnDisabledText: { color: "#94A3B8", fontWeight: "800", fontSize: 14 },

  // Carte de statut fenêtre temporelle
  windowCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 12, alignSelf: "stretch" },
  windowTitle: { fontSize: 14, fontWeight: "800" },
  windowText: { fontSize: 13, marginTop: 4, fontWeight: "600" },
  windowSub: { fontSize: 11, marginTop: 4, opacity: 0.85 },
  warningBox: { flexDirection: "row", gap: 8, marginTop: 16, padding: 12, backgroundColor: "#FEF3C7", borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A" },
  warningText: { flex: 1, fontSize: 12, color: "#78350F", lineHeight: 17 },
  warnPushBox: { flexDirection: "row", gap: 10, marginTop: 12, padding: 12, backgroundColor: "#FED7AA", borderRadius: 12, borderWidth: 1, borderColor: "#FB923C", alignItems: "flex-start", alignSelf: "stretch" },
  warnPushTitle: { fontSize: 13, fontWeight: "800", color: "#7C2D12" },
  warnPushText: { fontSize: 12, color: "#9A3412", marginTop: 4, lineHeight: 17 },
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
