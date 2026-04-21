import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOnlineStatus, useQueueCount, flushQueue, useAutoSync } from "../lib/offline";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const queueCount = useQueueCount();
  const [justReconnected, setJustReconnected] = useState(false);
  const prevOnline = useRef(online);
  const slide = useRef(new Animated.Value(-50)).current;

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
      toValue: visible ? 0 : -50,
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

  return (
    <Animated.View style={[styles.wrap, { backgroundColor: bg, transform: [{ translateY: slide }] }]} pointerEvents={visible ? "auto" : "none"}>
      <Ionicons name={icon} size={16} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
      {online && queueCount > 0 && (
        <TouchableOpacity onPress={() => flushQueue()} style={styles.retryBtn}>
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
    paddingVertical: 8,
    width: "100%",
  },
  text: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 12 },
  retryBtn: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
