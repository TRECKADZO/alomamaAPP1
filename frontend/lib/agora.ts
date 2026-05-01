/**
 * Agora wrapper - platform-specific.
 * Sur web, on retourne null (pas de module natif).
 * Sur native (iOS/Android), Metro résout vers agora.native.ts.
 */
export const AgoraSDK: any = null;
export const RtcSurfaceView: any = null;
export const ChannelProfileType: any = null;
export const ClientRoleType: any = null;
export const createAgoraRtcEngine: any = null;
export const isAgoraAvailable = false;
