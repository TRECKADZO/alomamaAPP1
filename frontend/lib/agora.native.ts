/**
 * Agora wrapper - native iOS/Android.
 * Charge le module react-native-agora réel.
 */
import * as Agora from "react-native-agora";

export const AgoraSDK: any = Agora;
export const RtcSurfaceView: any = Agora.RtcSurfaceView;
export const ChannelProfileType: any = Agora.ChannelProfileType;
export const ClientRoleType: any = Agora.ClientRoleType;
export const createAgoraRtcEngine: any = Agora.createAgoraRtcEngine;
export const isAgoraAvailable = true;
