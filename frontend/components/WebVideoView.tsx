/**
 * Stub pour iOS/Android. Metro résout vers WebVideoView.web.tsx sur plateforme web.
 * Sur native, ce composant n'est jamais utilisé (on utilise RtcSurfaceView d'Agora).
 */
import { View, StyleSheet } from "react-native";
import { forwardRef } from "react";

const WebVideoView = forwardRef<any, { style?: any }>((props, ref) => (
  <View ref={ref as any} style={[styles.box, props.style]} />
));

const styles = StyleSheet.create({
  box: { backgroundColor: "#000" },
});

WebVideoView.displayName = "WebVideoView";
export default WebVideoView;
