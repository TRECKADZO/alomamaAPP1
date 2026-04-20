import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { const { data } = await api.get("/notifications"); setItems(data); } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const readAll = async () => {
    try { await api.post("/notifications/read-all"); load(); } catch {}
  };

  const read = async (id: string) => {
    try { await api.post(`/notifications/${id}/read`); load(); } catch {}
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const iconFor = (t: string) => ({ rdv: "calendar", message: "mail", rappel: "alarm" } as any)[t] || "notifications";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={readAll} testID="read-all-btn">
          <Text style={styles.linkText}>Tout lire</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Pas de notifications</Text>
          </View>
        ) : items.map((n) => (
          <TouchableOpacity key={n.id} style={[styles.card, !n.read && styles.unread]} onPress={() => read(n.id)} testID={`notif-${n.id}`}>
            <View style={[styles.icon, { backgroundColor: n.read ? COLORS.bgSecondary : COLORS.primaryLight }]}>
              <Ionicons name={iconFor(n.type)} size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.notifTitle, !n.read && { fontWeight: "800" }]}>{n.title}</Text>
              <Text style={styles.notifBody}>{n.body}</Text>
              <Text style={styles.notifDate}>{new Date(n.created_at).toLocaleString("fr-FR")}</Text>
            </View>
            {!n.read && <View style={styles.dot} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  linkText: { color: COLORS.primary, fontWeight: "700" },
  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: COLORS.textSecondary, marginTop: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  unread: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight + "40" },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  notifTitle: { color: COLORS.textPrimary, fontWeight: "600" },
  notifBody: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  notifDate: { color: COLORS.textMuted, fontSize: 10, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
});
