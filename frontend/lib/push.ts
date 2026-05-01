import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";

/**
 * Configuration handler des notifications quand l'app est OUVERTE (foreground).
 * Sans ça, les notifs arrivent silencieusement et ne s'affichent pas dans la barre.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

/**
 * Helpers de gestion du badge (le petit chiffre rouge sur l'icône de l'app).
 * - iOS : natif
 * - Android : la plupart des launchers (Pixel, Samsung, Xiaomi…) supportent via la notif channel
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // ignore : pas critique
  }
}

export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

export async function getBadgeCount(): Promise<number> {
  try {
    if (Platform.OS === "web") return 0;
    return await Notifications.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

/**
 * Setup des listeners pour :
 *  1. Notifications reçues quand l'app est au premier plan (in-app banner)
 *  2. Tap utilisateur sur une notif (depuis la barre système → ouvre l'app)
 *
 * Retourne une fonction de cleanup à appeler dans le useEffect parent.
 */
export function registerNotificationListeners(handlers: {
  onForegroundReceive?: (n: Notifications.Notification) => void;
  onNotificationTap?: (response: Notifications.NotificationResponse) => void;
}): () => void {
  const subs: Notifications.Subscription[] = [];

  if (handlers.onForegroundReceive) {
    subs.push(
      Notifications.addNotificationReceivedListener((notif) => {
        try { handlers.onForegroundReceive!(notif); } catch (e) { console.warn("onForegroundReceive error", e); }
      })
    );
  }
  if (handlers.onNotificationTap) {
    subs.push(
      Notifications.addNotificationResponseReceivedListener((response) => {
        try { handlers.onNotificationTap!(response); } catch (e) { console.warn("onNotificationTap error", e); }
      })
    );
  }

  return () => {
    subs.forEach((s) => {
      try { s.remove(); } catch {}
    });
  };
}

/**
 * Récupère le projectId Expo (nécessaire pour Android FCM en production).
 * Source : app.json → extra.eas.projectId, OU constante Expo.
 */
function getExpoProjectId(): string | undefined {
  try {
    const fromConfig =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants.easConfig as any)?.projectId ||
      (Constants as any)?.manifest2?.extra?.eas?.projectId;
    return fromConfig;
  } catch {
    return undefined;
  }
}

/**
 * Crée le canal de notifications Android (REQUIS sur Android 8+).
 * Importance HIGH pour que la notif apparaisse en pop-up + sonne + vibre.
 *
 * On crée aussi un canal "calls" dédié aux appels entrants téléconsultation
 * avec son continu + vibration prolongée (comme un appel téléphonique).
 */
async function setupAndroidChannel() {
  if (Platform.OS !== "android") return;

  // Canal par défaut : rappels, messages, etc.
  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications À lo Maman",
    description: "Rappels RDV, conseils santé, messages des Pros",
    importance: Notifications.AndroidImportance.HIGH, // pop-up + son + vibration
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#F4A754",
    sound: "default",
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    bypassDnd: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // Canal "calls" : téléconsultation appels entrants — MAX priorité
  await Notifications.setNotificationChannelAsync("calls", {
    name: "Appels téléconsultation",
    description: "Notifications sonores quand un Pro ou une patiente vous appelle en visio",
    importance: Notifications.AndroidImportance.MAX, // full-screen heads-up + son continu
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000], // long ring pattern
    lightColor: "#10B981",
    sound: "default",
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    bypassDnd: true, // passe même en mode Ne-pas-déranger
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Demande la permission + obtient le token Expo Push + l'envoie au backend.
 * Retourne le token ou null. Ne crash JAMAIS l'app.
 */
export async function registerExpoPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      console.log("[push] Web platform — push notifications natives non supportées");
      return null;
    }
    if (!Device.isDevice) {
      console.log("[push] Émulateur détecté — token Expo non disponible");
      return null;
    }

    // 1) Setup canal Android d'abord (requis avant toute notif)
    await setupAndroidChannel();

    // 2) Permission utilisateur (POST_NOTIFICATIONS sur Android 13+)
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.warn("[push] Permission refusée par l'utilisateur");
      return null;
    }

    // 3) Récupération du token Expo
    const projectId = getExpoProjectId();
    let tokenData;
    try {
      // En production, projectId est OBLIGATOIRE
      tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
    } catch (err: any) {
      console.warn("[push] getExpoPushTokenAsync error:", err?.message || err);
      return null;
    }

    const token = tokenData?.data;
    if (!token) {
      console.warn("[push] Token vide reçu d'Expo");
      return null;
    }

    console.log("[push] ✅ Token Expo obtenu:", token.substring(0, 30) + "...");

    // 4) Envoi au backend
    try {
      await api.post("/push-token", { token });
      console.log("[push] ✅ Token enregistré côté serveur");
    } catch (err: any) {
      console.warn("[push] Échec enregistrement serveur:", err?.message || err);
      // On retourne quand même le token pour debug
    }

    return token;
  } catch (err: any) {
    console.warn("[push] Erreur globale:", err?.message || err);
    return null;
  }
}

/**
 * Helper de diagnostic — appelable depuis une page admin pour tester
 * que tout fonctionne. Renvoie un objet détaillé.
 */
export async function diagnosePushSetup(): Promise<{
  platform: string;
  isDevice: boolean;
  permissionStatus: string;
  hasProjectId: boolean;
  projectId: string | undefined;
  tokenObtained: boolean;
  token: string | null;
  error: string | null;
}> {
  const result = {
    platform: Platform.OS,
    isDevice: Device.isDevice,
    permissionStatus: "unknown",
    hasProjectId: false,
    projectId: undefined as string | undefined,
    tokenObtained: false,
    token: null as string | null,
    error: null as string | null,
  };
  try {
    const projectId = getExpoProjectId();
    result.projectId = projectId;
    result.hasProjectId = !!projectId;

    const { status } = await Notifications.getPermissionsAsync();
    result.permissionStatus = status;

    if (Platform.OS !== "web" && Device.isDevice && status === "granted") {
      const tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      result.token = tokenData?.data || null;
      result.tokenObtained = !!result.token;
    }
  } catch (err: any) {
    result.error = err?.message || String(err);
  }
  return result;
}
