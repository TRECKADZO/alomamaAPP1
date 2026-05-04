/**
 * Agora Web SDK wrapper - WEB UNIQUEMENT (chargé par Metro sur Platform.OS === "web").
 *
 * ⚠️ IMPORTANT : Expo Router effectue un pré-rendu SSR côté serveur (Node.js) où
 * `window` n'existe pas. On NE DOIT DONC PAS importer `agora-rtc-sdk-ng` au top level.
 * On le charge dynamiquement à la création du client (runtime navigateur uniquement).
 */

// Chargeur paresseux du SDK Agora — évite "window is not defined" en SSR
let _AgoraRTC: any = null;
async function getAgoraRTC() {
  if (_AgoraRTC) return _AgoraRTC;
  if (typeof window === "undefined") {
    throw new Error("Agora Web ne peut pas être utilisé côté serveur");
  }
  const mod = await import("agora-rtc-sdk-ng");
  _AgoraRTC = mod.default || mod;
  try { _AgoraRTC.setLogLevel?.(3); } catch {}
  return _AgoraRTC;
}

export type WebAgoraCallbacks = {
  onRemoteJoined?: (user: any) => void;
  onRemoteLeft?: (user: any) => void;
  onNetworkQuality?: (up: number, down: number) => void;
  onError?: (err: any) => void;
};

export class WebAgoraClient {
  private client: any = null;
  private localAudio: any = null;
  private localVideo: any = null;
  private remoteUser: any = null;
  private callbacks: WebAgoraCallbacks = {};
  private _joined = false;
  private _pendingCallbacks: WebAgoraCallbacks | null = null;

  constructor() {
    // Init asynchrone ; la connexion (join) attendra que le client soit prêt
    this._initClient();
  }

  private async _initClient() {
    const AgoraRTC = await getAgoraRTC();
    this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    if (this._pendingCallbacks) {
      this.setCallbacks(this._pendingCallbacks);
      this._pendingCallbacks = null;
    }
  }

  private async _ready() {
    // Attend que _initClient soit terminé
    while (!this.client) await new Promise((r) => setTimeout(r, 50));
  }

  setCallbacks(cb: WebAgoraCallbacks) {
    this.callbacks = cb;
    if (!this.client) {
      this._pendingCallbacks = cb;
      return;
    }

    this.client.on("user-published", async (user: any, mediaType: string) => {
      try {
        await this.client.subscribe(user, mediaType);
        this.remoteUser = user;
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
        this.callbacks.onRemoteJoined?.(user);
      } catch (e) {
        this.callbacks.onError?.(e);
      }
    });

    this.client.on("user-unpublished", (user: any) => {
      this.callbacks.onRemoteLeft?.(user);
    });

    this.client.on("user-left", (user: any) => {
      if (this.remoteUser?.uid === user.uid) this.remoteUser = null;
      this.callbacks.onRemoteLeft?.(user);
    });

    this.client.on("network-quality", (stats: any) => {
      this.callbacks.onNetworkQuality?.(
        stats?.uplinkNetworkQuality ?? 0,
        stats?.downlinkNetworkQuality ?? 0,
      );
    });

    this.client.on("exception", (ex: any) => {
      this.callbacks.onError?.(ex);
    });
  }

  async join(appId: string, channel: string, token: string, uid: number) {
    if (this._joined) return;
    await this._ready();
    const AgoraRTC = await getAgoraRTC();

    // 1. Rejoindre le canal
    await this.client.join(appId, channel, token, uid);

    // 2. Créer les pistes locales (audio + vidéo)
    try {
      this.localAudio = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true, ANS: true, AGC: true,
      });
    } catch (e) {
      console.warn("[Agora Web] Mic access denied", e);
      this.callbacks.onError?.(e);
    }
    try {
      this.localVideo = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: "480p_1",
      });
    } catch (e) {
      console.warn("[Agora Web] Camera access denied", e);
      this.callbacks.onError?.(e);
    }

    const toPublish = [this.localAudio, this.localVideo].filter(Boolean);
    if (toPublish.length) {
      await this.client.publish(toPublish);
    }
    this._joined = true;
  }

  getLocalVideoTrack() { return this.localVideo; }
  getRemoteUser() { return this.remoteUser; }

  playLocalVideo(element: HTMLElement | null) {
    if (!element) return;
    try { this.localVideo?.play(element); } catch (e) { console.warn("[Agora Web] playLocalVideo", e); }
  }

  playRemoteVideo(element: HTMLElement | null, user?: any) {
    const u = user || this.remoteUser;
    if (!element || !u?.videoTrack) return;
    try { u.videoTrack.play(element); } catch (e) { console.warn("[Agora Web] playRemoteVideo", e); }
  }

  playRemoteAudio(user?: any) {
    const u = user || this.remoteUser;
    try { u?.audioTrack?.play(); } catch {}
  }

  async setAudioEnabled(enabled: boolean) {
    try { await this.localAudio?.setEnabled(enabled); } catch {}
  }

  async setVideoEnabled(enabled: boolean) {
    try { await this.localVideo?.setEnabled(enabled); } catch {}
  }

  async leave() {
    try {
      this.localAudio?.close();
      this.localVideo?.close();
    } catch {}
    this.localAudio = null;
    this.localVideo = null;
    this.remoteUser = null;
    try { await this.client?.leave(); } catch {}
    try { this.client?.removeAllListeners(); } catch {}
    this._joined = false;
  }
}

export const WEB_AGORA_AVAILABLE = true;
