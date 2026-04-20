import { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Patients() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/pro/patients");
      setPatients(data);
    } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes patientes</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{patients.length}</Text>
        </View>
      </View>

      <FlatList
        data={patients}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.email}</Text>
              {item.phone && <Text style={styles.meta}>📞 {item.phone}</Text>}
            </View>
            <TouchableOpacity
              style={styles.msgBtn}
              onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(item.name)}`)}
              testID={`msg-patient-${item.id}`}
            >
              <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune patiente</Text>
            <Text style={styles.emptyText}>Les patientes prenant RDV avec vous apparaîtront ici.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.xl },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  badge: { backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.pill },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  name: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 15 },
  meta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  msgBtn: { width: 40, height: 40, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
});
