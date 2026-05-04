/**
 * Agora Web SDK wrapper - STUB pour iOS/Android.
 * Metro résout vers agoraWeb.web.ts sur plateforme web.
 * Sur native, on utilise react-native-agora (voir lib/agora.native.ts).
 */
export type WebAgoraCallbacks = {
  onRemoteJoined?: (user: any) => void;
  onRemoteLeft?: (user: any) => void;
  onNetworkQuality?: (up: number, down: number) => void;
  onError?: (err: any) => void;
};

export class WebAgoraClient {
  constructor() { throw new Error("WebAgoraClient indisponible sur cette plateforme"); }
  setCallbacks(_cb: WebAgoraCallbacks) {}
  async join(_appId: string, _channel: string, _token: string, _uid: number) {}
  getLocalVideoTrack(): any { return null; }
  getRemoteUser(): any { return null; }
  playLocalVideo(_el: any) {}
  playRemoteVideo(_el: any, _user: any) {}
  playRemoteAudio(_user: any) {}
  async setAudioEnabled(_enabled: boolean) {}
  async setVideoEnabled(_enabled: boolean) {}
  async leave() {}
}

export const WEB_AGORA_AVAILABLE = false;
