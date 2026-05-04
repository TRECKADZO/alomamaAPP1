import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView,
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
  const [contacts, setContacts] = useState<any[]>([]);       // pros (maman) OU patientes (pro)
  const [centrePros, setCentrePros] = useState<any[]>([]);   // centre uniquement
  const [centrePatients, setCentrePatients] = useState<any[]>([]); // centre uniquement

  const isMaman = user?.role === "maman";
  const isPro = user?.role === "professionnel";
  const isCentre = user?.role === "centre_sante";

  const load = async () => {
    try {
      const [convosRes] = await Promise.all([api.get("/messages/conversations")]);
      setConvos(convosRes.data || []);

      if (isMaman) {
        const r = await api.get("/professionnels");
        setContacts(r.data || []);
      } else if (isPro) {
        const r = await api.get("/pro/patients");
        setContacts(r.data || []);
      } else if (isCentre) {
        const r = await api.get("/centre/contacts");
        setCentrePros(r.data?.pros || []);
        setCentrePatients(r.data?.patientes || []);
      }
    } catch (e) {
      console.warn("Load messages failed", e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const existingIds = new Set(convos.map((c) => c.other_id));
  // Pour maman/pro : contacts qui n'ont pas encore de conversation
  const newContacts = contacts.filter((p) => !existingIds.has(p.id));
  // Pour centre : nouveaux pros et patientes (sans conversation existante)
  const newPros = centrePros.filter((p) => !existingIds.has(p.id));
  const newPatients = centrePatients.filter((p) => !existingIds.has(p.id));

  const sectionLabel = isMaman ? "Démarrer une conversation" : isPro ? "Mes patientes" : "";

  const openChat = (id: string, name: string) => {
    router.push(`/chat/${id}?name=${encodeURIComponent(name || "")}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>
          {isCentre ? "Mes pros et mes patientes" : isPro ? "Mes patientes" : "Mes professionnels"}
        </Text>
      </View>

      <FlatList
        data={convos}
        keyExtractor={(i) => i.other_id}
        contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {/* CENTRE : 2 sections (Pros + Patientes) */}
            {isCentre && newPros.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="medkit" size={14} color="#A855F7" />
                  <Text style={[styles.sectionLabel, { color: "#A855F7" }]}>
                    Mes professionnels ({newPros.length})
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {newPros.map((p) => (
                    <ContactChip
                      key={p.id}
                      contact={p}
                      colorMain="#A855F7"
                      onPress={() => openChat(p.id, p.name)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}
            {isCentre && newPatients.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="heart" size={14} color="#EC4899" />
                  <Text style={[styles.sectionLabel, { color: "#EC4899" }]}>
                    Mes patientes ({newPatients.length})
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {newPatients.map((p) => (
                    <ContactChip
                      key={p.id}
                      contact={p}
                      colorMain="#EC4899"
                      onPress={() => openChat(p.id, p.name)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* MAMAN ou PRO : 1 section */}
            {(isMaman || isPro) && newContacts.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {newContacts.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.newChip}
                      onPress={() => openChat(p.id, p.name)}
                      testID={`new-convo-${p.id}`}
                    >
                      <View style={[styles.chipAvatar, isPro && { backgroundColor: "#EC4899" }]}>
                        <Text style={styles.chipAvatarText}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.chipName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.chipSpec} numberOfLines={1}>
                        {isMaman ? (p.specialite || "Pro") : (p.has_grossesse ? `🤰 ${p.grossesse_sa || "?"} SA` : p.enfants_count > 0 ? `👶 ${p.enfants_count} enfant${p.enfants_count > 1 ? "s" : ""}` : "Patiente")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {convos.length > 0 && (
              <Text style={[styles.sectionLabel, { marginTop: 4, marginBottom: 8 }]}>Mes conversations</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conv}
            onPress={() => openChat(item.other_id, item.other_name)}
            testID={`conv-${item.other_id}`}
          >
            <View style={[styles.avatar, { backgroundColor: item.other_role === "professionnel" ? "#A855F7" : item.other_role === "centre_sante" ? "#6366F1" : COLORS.primary }]}>
              <Text style={styles.avatarText}>{item.other_name?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.convName}>{item.other_name}</Text>
              <Text numberOfLines={1} style={styles.convLast}>{item.last?.content || (item.last?.attachment_name ? `📎 ${item.last.attachment_name}` : "")}</Text>
            </View>
            {item.unread > 0 && (
              <View style={styles.unread}>
                <Text style={styles.unreadText}>{item.unread > 9 ? "9+" : item.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune conversation</Text>
            <Text style={styles.emptyText}>
              {isMaman
                ? "Sélectionnez un professionnel ci-dessus pour démarrer une conversation."
                : isPro
                  ? (newContacts.length > 0
                      ? "Sélectionnez une patiente ci-dessus pour démarrer une conversation."
                      : "Vos conversations apparaîtront ici dès qu'une patiente vous contactera ou que vous aurez un RDV en commun.")
                  : isCentre
                    ? (newPros.length > 0 || newPatients.length > 0
                        ? "Sélectionnez un pro ou une patiente ci-dessus pour démarrer une conversation."
                        : "Aucun pro membre de votre centre. Partagez votre code centre avec les pros pour qu'ils vous rejoignent.")
                    : "Vos conversations apparaîtront ici"}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ----- Chip de contact réutilisable (centre) -----
function ContactChip({ contact, colorMain, onPress }: any) {
  const hasUnread = (contact.unread_count || 0) > 0;
  return (
    <TouchableOpacity
      style={[styles.contactChip, hasUnread && { borderColor: colorMain, borderWidth: 2 }]}
      onPress={onPress}
      testID={`new-${contact.type}-${contact.id}`}
    >
      <View style={[styles.chipAvatarLg, { backgroundColor: colorMain }]}>
        <Text style={styles.chipAvatarText}>{(contact.name || "?").charAt(0).toUpperCase()}</Text>
        {hasUnread && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{contact.unread_count > 9 ? "9+" : contact.unread_count}</Text>
          </View>
        )}
      </View>
      <Text style={styles.chipName} numberOfLines={1}>{contact.name}</Text>
      <Text style={[styles.chipSpec, { color: colorMain }]} numberOfLines={1}>
        {contact.type === "pro"
          ? (contact.specialite || "Professionnel")
          : (contact.has_grossesse
              ? `🤰 ${contact.grossesse_sa || "?"} SA`
              : contact.enfants_count > 0
                ? `👶 ${contact.enfants_count} enfant${contact.enfants_count > 1 ? "s" : ""}`
                : "Patiente")}
      </Text>
      {contact.last_message ? (
        <Text style={styles.chipPreview} numberOfLines={1}>
          {contact.last_message_from_me ? "Vous: " : ""}{contact.last_message}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { padding: SPACING.xl, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: COLORS.textSecondary, marginBottom: 10, textTransform: "uppercase" },

  newChip: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginRight: 8, alignItems: "center", width: 110, borderWidth: 1, borderColor: COLORS.border },
  contactChip: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 10, marginRight: 8, alignItems: "center", width: 130, borderWidth: 1, borderColor: COLORS.border },
  chipAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  chipAvatarLg: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 6, position: "relative" },
  chipAvatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  chipName: { fontWeight: "700", fontSize: 12, color: COLORS.textPrimary, textAlign: "center" },
  chipSpec: { fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 2 },
  chipPreview: { fontSize: 10, color: COLORS.textSecondary, textAlign: "center", marginTop: 4, fontStyle: "italic" },
  unreadBadge: { position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#EF4444", paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  conv: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  convName: { fontWeight: "700", color: COLORS.textPrimary },
  convLast: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
