/**
 * Agora Web SDK wrapper - WEB UNIQUEMENT (chargé par Metro sur Platform.OS === "web").
 * Utilise agora-rtc-sdk-ng pour permettre la visio HD dans les navigateurs desktop
 * et remplacer Jitsi. Même App ID, même channel, même token que la version native.
 */
import AgoraRTC from "agora-rtc-sdk-ng";
import type {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";

// Réduire le bruit dans la console en dev
try { AgoraRTC.setLogLevel(3); } catch {}

export type WebAgoraCallbacks = {
  onRemoteJoined?: (user: IAgoraRTCRemoteUser) => void;
  onRemoteLeft?: (user: IAgoraRTCRemoteUser) => void;
  onNetworkQuality?: (up: number, down: number) => void;
  onError?: (err: any) => void;
};

export class WebAgoraClient {
  private client: IAgoraRTCClient;
  private localAudio: IMicrophoneAudioTrack | null = null;
  private localVideo: ICameraVideoTrack | null = null;
  private remoteUser: IAgoraRTCRemoteUser | null = null;
  private callbacks: WebAgoraCallbacks = {};
  private _joined = false;

  constructor() {
    this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  }

  setCallbacks(cb: WebAgoraCallbacks) {
    this.callbacks = cb;

    this.client.on("user-published", async (user, mediaType) => {
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

    this.client.on("user-unpublished", (user) => {
      // Juste une piste coupée — on garde l'utilisateur en mémoire
      this.callbacks.onRemoteLeft?.(user);
    });

    this.client.on("user-left", (user) => {
      if (this.remoteUser?.uid === user.uid) this.remoteUser = null;
      this.callbacks.onRemoteLeft?.(user);
    });

    this.client.on("network-quality", (stats: any) => {
      this.callbacks.onNetworkQuality?.(
        stats?.uplinkNetworkQuality ?? 0,
        stats?.downlinkNetworkQuality ?? 0,
      );
    });

    this.client.on("exception", (ex) => {
      this.callbacks.onError?.(ex);
    });
  }

  async join(appId: string, channel: string, token: string, uid: number) {
    if (this._joined) return;
    // 1. Join the RTC channel
    await this.client.join(appId, channel, token, uid);

    // 2. Create local tracks (audio + video)
    // Defaults: 480p @ 30fps, stereo audio, good balance for 3G/4G in West Africa
    try {
      this.localAudio = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        ANS: true,
        AGC: true,
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

    // 3. Publish whichever tracks we obtained
    const toPublish = [this.localAudio, this.localVideo].filter(Boolean) as any[];
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

  playRemoteVideo(element: HTMLElement | null, user?: IAgoraRTCRemoteUser | null) {
    const u = user || this.remoteUser;
    if (!element || !u?.videoTrack) return;
    try { u.videoTrack.play(element); } catch (e) { console.warn("[Agora Web] playRemoteVideo", e); }
  }

  playRemoteAudio(user?: IAgoraRTCRemoteUser | null) {
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
    try { await this.client.leave(); } catch {}
    try { this.client.removeAllListeners(); } catch {}
    this._joined = false;
  }
}

export const WEB_AGORA_AVAILABLE = true;
