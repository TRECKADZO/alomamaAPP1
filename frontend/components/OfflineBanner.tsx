import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useOnlineStatus, useQueueCount, flushQueue, useAutoSync } from "../lib/offline";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const queueCount = useQueueCount();
  const router = useRouter();
  const [justReconnected, setJustReconnected] = useState(false);
  const prevOnline = useRef(online);
  const slide = useRef(new Animated.Value(-60)).current;
  const insets = useSafeAreaInsets();

  // Kick off the auto-sync interval for the whole app
  useAutoSync();

  useEffect(() => {
    if (!prevOnline.current && online) {
      // Reconnected
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 2800);
      return () => clearTimeout(t);
    }
    prevOnline.current = online;
  }, [online]);

  const visible = !online || queueCount > 0 || justReconnected;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -60,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  let bg = "#16A34A";
  let icon: any = "cloud-done-outline";
  let label = "Synchronisé ✓";
  if (!online) {
    bg = "#DC2626";
    icon = "cloud-offline-outline";
    label = queueCount > 0
      ? `Mode hors ligne · ${queueCount} action${queueCount > 1 ? "s" : ""} en attente`
      : "Mode hors ligne — les données affichées peuvent ne pas être à jour";
  } else if (queueCount > 0) {
    bg = "#F59E0B";
    icon = "sync-outline";
    label = `Synchronisation · ${queueCount} en attente`;
  }

  // Padding top = status bar height sur mobile, 0 sur web
  const topPadding = Platform.OS === "web" ? 6 : Math.max(insets.top, 8) + 4;

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.wrap, { backgroundColor: bg, paddingTop: topPadding, transform: [{ translateY: slide }] }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <TouchableOpacity
        style={styles.contentRow}
        onPress={() => router.push("/sync")}
        activeOpacity={0.8}
        testID="offline-banner-tap"
      >
        <Ionicons name={icon} size={16} color="#fff" />
        <Text style={styles.text} numberOfLines={1}>{label}</Text>
        {queueCount > 0 && <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.8)" />}
      </TouchableOpacity>
      {online && queueCount > 0 && (
        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); flushQueue(); }} style={styles.retryBtn} testID="banner-sync-btn">
          <Text style={styles.retryText}>Synchroniser</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
    width: "100%",
  },
  contentRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  text: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 12 },
  retryBtn: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
