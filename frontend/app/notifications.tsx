import { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { useNotifications } from "../lib/notifications-context";
import { clearBadge } from "../lib/push";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Notifications() {
  const router = useRouter();
  const { notifications, loading, refresh, markAllRead, markRead } = useNotifications();

  // À chaque fois qu'on entre sur cette page :
  // - Re-sync depuis le backend
  // - Effacer le badge système (l'utilisateur consulte la liste, donc plus de "alerte")
  useFocusEffect(
    useCallback(() => {
      refresh();
      clearBadge();
    }, [refresh])
  );

  if (loading && notifications.length === 0)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );

  const iconFor = (t: string) =>
    ({
      rdv: "calendar",
      message: "mail",
      rappel: "alarm",
      test: "checkmark-circle",
      payment: "wallet",
      premium: "star",
      rdv_confirmation: "checkmark-done-circle",
      rdv_cancellation: "close-circle",
    } as any)[t] || "notifications";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead} testID="read-all-btn">
          <Text style={styles.linkText}>Tout lire</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Pas de notifications</Text>
          </View>
        ) : (
          notifications.map((n) => (
            <TouchableOpacity
              key={n.id}
              style={[styles.card, !n.read && styles.unread]}
              onPress={() => markRead(n.id)}
              testID={`notif-${n.id}`}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: n.read ? COLORS.bgSecondary : COLORS.primaryLight },
                ]}
              >
                <Ionicons name={iconFor(n.type)} size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.notifTitle, !n.read && { fontWeight: "800" }]}>{n.title}</Text>
                <Text style={styles.notifBody}>{n.body}</Text>
                <Text style={styles.notifDate}>{new Date(n.created_at).toLocaleString("fr-FR")}</Text>
              </View>
              {!n.read && <View style={styles.dot} />}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  linkText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 10, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  unread: { backgroundColor: "#FFF7EE", borderColor: "#FCD9B6" },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  notifTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  notifBody: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  notifDate: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
});
