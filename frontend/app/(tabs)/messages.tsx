import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Messages() {
  const { user } = useAuth();
  const router = useRouter();
  const [convos, setConvos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pros, setPros] = useState<any[]>([]);

  const load = async () => {
    try {
      const [c, p] = await Promise.all([
        api.get("/messages/conversations"),
        user?.role === "maman" ? api.get("/professionnels") : Promise.resolve({ data: [] }),
      ]);
      setConvos(c.data);
      setPros(p.data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const existingIds = new Set(convos.map((c) => c.other_id));
  const newPros = pros.filter((p) => !existingIds.has(p.id));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      <FlatList
        data={convos}
        keyExtractor={(i) => i.other_id}
        contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}
        ListHeaderComponent={
          user?.role === "maman" && newPros.length > 0 ? (
            <View style={{ marginBottom: 20 }}>
              <Text style={styles.sectionLabel}>Démarrer une conversation</Text>
              <FlatList
                horizontal
                data={newPros}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.newChip}
                    onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(item.name)}`)}
                    testID={`new-convo-${item.id}`}
                  >
                    <View style={styles.chipAvatar}>
                      <Text style={styles.chipAvatarText}>{item.name.charAt(0)}</Text>
                    </View>
                    <Text style={styles.chipName}>{item.name}</Text>
                    <Text style={styles.chipSpec} numberOfLines={1}>{item.specialite}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conv}
            onPress={() => router.push(`/chat/${item.other_id}?name=${encodeURIComponent(item.other_name)}`)}
            testID={`conv-${item.other_id}`}
          >
            <View style={[styles.avatar, { backgroundColor: item.other_role === "professionnel" ? COLORS.secondary : COLORS.primary }]}>
              <Text style={styles.avatarText}>{item.other_name?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.convName}>{item.other_name}</Text>
              <Text numberOfLines={1} style={styles.convLast}>{item.last?.content}</Text>
            </View>
            {item.unread > 0 && (
              <View style={styles.unread}>
                <Text style={styles.unreadText}>{item.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune conversation</Text>
            <Text style={styles.emptyText}>
              {user?.role === "maman" ? "Sélectionnez un professionnel ci-dessus" : "Vos conversations apparaîtront ici"}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { padding: SPACING.xl },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 10, textTransform: "uppercase" },
  newChip: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginRight: 8, alignItems: "center", width: 100, borderWidth: 1, borderColor: COLORS.border },
  chipAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  chipAvatarText: { color: "#fff", fontWeight: "800" },
  chipName: { fontWeight: "700", fontSize: 12, color: COLORS.textPrimary, textAlign: "center" },
  chipSpec: { fontSize: 10, color: COLORS.textSecondary, textAlign: "center", marginTop: 2 },
  conv: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  convName: { fontWeight: "700", color: COLORS.textPrimary },
  convLast: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6 },
});
