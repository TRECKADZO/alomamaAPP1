import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { cachedGet } from "../../lib/offline";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function Patients() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCentre = user?.role === "centre_sante";

  const load = async () => {
    setErrorMsg(null);
    try {
      const path = isCentre ? "/centre/membres" : "/pro/patients";
      const r = await cachedGet<any[]>(path);
      setList(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setErrorMsg(formatError(e));
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [user?.role]));

  const filtered = list.filter((p) =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    (p.specialite || "").toLowerCase().includes(search.toLowerCase())
  );

  // Stats (role-aware)
  const grossessesActives = isCentre ? 0 : list.filter((p) => p.has_grossesse).length;
  const totalEnfants = isCentre ? 0 : list.reduce((s, p) => s + (p.enfants_count || 0), 0);
  const totalRdv = isCentre ? list.reduce((s, p) => s + (p.rdv_count || 0), 0) : 0;
  const totalPatients = isCentre ? list.reduce((s, p) => s + (p.patients_count || 0), 0) : 0;

  const removeMembre = (proId: string, name: string) => {
    Alert.alert(
      "Retirer ce professionnel ?",
      `Voulez-vous retirer ${name || "ce pro"} de votre centre ?`,
      [
        { text: "Annuler" },
        {
          text: "Retirer",
          style: "destructive",
          onPress: async () => {
            try {
              await api.post("/centre/membres/remove", { pro_id: proId });
              load();
            } catch (e: any) {
              Alert.alert("Erreur", formatError(e));
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header gradient */}
      <LinearGradient colors={isCentre ? ["#A855F7", "#6366F1"] : ["#2DD4BF", "#06B6D4"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {isCentre ? "Mes professionnels" : "Mes patientes"}
            </Text>
            <Text style={styles.headerSub}>
              {isCentre ? "Gérez les pros de votre centre" : "Suivez vos patientes"}
            </Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{list.length}</Text>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.8)" />
          <TextInput
            style={styles.search}
            placeholder={isCentre ? "Rechercher un professionnel..." : "Rechercher une patiente..."}
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </LinearGradient>

      {/* Stats + Actions */}
      <View style={styles.statsRow}>
        {isCentre ? (
          <>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: "#A855F7" }]}>{list.length}</Text>
              <Text style={styles.statLabel}>Pros</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: "#06B6D4" }]}>{totalRdv}</Text>
              <Text style={styles.statLabel}>RDV</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: "#EC4899" }]}>{totalPatients}</Text>
              <Text style={styles.statLabel}>Patientes</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: "#EC4899" }]}>{grossessesActives}</Text>
              <Text style={styles.statLabel}>Grossesses</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: "#3B82F6" }]}>{totalEnfants}</Text>
              <Text style={styles.statLabel}>Enfants</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: "#A855F7" }]}>{list.length}</Text>
              <Text style={styles.statLabel}>Patientes</Text>
            </View>
          </>
        )}
      </View>

      {/* Actions rapides */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 110 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
        {isCentre ? (
          <>
            <Action icon="people" label="Membres" color="#A855F7" onPress={() => router.push("/centre/membres")} />
            <Action icon="calendar" label="Calendrier" color="#6366F1" onPress={() => router.push("/centre/calendrier")} />
            <Action icon="pricetag" label="Tarifs" color="#F59E0B" onPress={() => router.push("/centre/tarifs")} />
            <Action icon="business" label="Mon centre" color="#06B6D4" onPress={() => router.push("/centres")} />
          </>
        ) : (
          <>
            <Action icon="calendar" label="Disponibilités" color="#2DD4BF" onPress={() => router.push("/pro/disponibilites")} />
            <Action icon="person-add" label="Consulter dossier" color="#3B82F6" onPress={() => router.push("/pro/consulter-patient")} />
            <Action icon="pricetags" label="Prestations" color="#F59E0B" onPress={() => router.push("/pro/prestations")} />
            <Action icon="cash" label="Revenus" color="#059669" onPress={() => router.push("/pro/revenus")} />
            <Action icon="shield-checkmark" label="CMU" color="#16A34A" onPress={() => router.push("/pro/cmu")} />
            <Action icon="alarm" label="Rappels" color="#EC4899" onPress={() => router.push("/pro/rappels")} />
            <Action icon="sparkles" label="IA Pro" color="#A855F7" onPress={() => router.push("/pro/ia")} />
            <Action icon="videocam" label="Téléconsult." color="#06B6D4" onPress={() => router.push("/(tabs)/rdv")} />
          </>
        )}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingTop: 4, paddingBottom: 60 }}>
        {errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={18} color="#B91C1C" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={isCentre ? "medkit-outline" : "people-outline"} size={60} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>{isCentre ? "Aucun professionnel" : "Aucune patiente"}</Text>
            <Text style={styles.emptyText}>
              {isCentre
                ? "Aucun pro n'est rattaché à votre centre pour le moment. Partagez le code de votre centre aux pros pour qu'ils le rejoignent."
                : "Les patientes prenant RDV avec vous apparaîtront ici."}
            </Text>
          </View>
        ) : (
          filtered.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.card}
              onPress={() => !isCentre && router.push(`/pro/dossier/${p.id}`)}
              activeOpacity={isCentre ? 1 : 0.7}
              testID={`item-card-${p.id}`}
            >
              <LinearGradient
                colors={isCentre ? ["#A855F7", "#6366F1"] : ["#2DD4BF", "#06B6D4"]}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name || "—"}</Text>
                {isCentre && p.specialite ? (
                  <Text style={styles.specialite}>{p.specialite}</Text>
                ) : null}
                <Text style={styles.meta} numberOfLines={1}>{p.email || p.phone || ""}</Text>
                <View style={styles.badges}>
                  {isCentre ? (
                    <>
                      {typeof p.rdv_count === "number" && (
                        <View style={[styles.badge, { backgroundColor: "#E0F2FE" }]}>
                          <Ionicons name="calendar" size={10} color="#0369A1" />
                          <Text style={[styles.badgeText, { color: "#0369A1" }]}>{p.rdv_count} RDV</Text>
                        </View>
                      )}
                      {typeof p.patients_count === "number" && (
                        <View style={[styles.badge, { backgroundColor: "#FCE7F3" }]}>
                          <Ionicons name="people" size={10} color="#BE185D" />
                          <Text style={[styles.badgeText, { color: "#BE185D" }]}>{p.patients_count} patiente{p.patients_count > 1 ? "s" : ""}</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      {p.has_grossesse && (
                        <View style={[styles.badge, { backgroundColor: "#FCE7F3" }]}>
                          <Ionicons name="heart" size={10} color="#BE185D" />
                          <Text style={[styles.badgeText, { color: "#BE185D" }]}>{p.grossesse_sa || "?"} SA</Text>
                        </View>
                      )}
                      {p.enfants_count > 0 && (
                        <View style={[styles.badge, { backgroundColor: "#DBEAFE" }]}>
                          <Ionicons name="happy" size={10} color="#1D4ED8" />
                          <Text style={[styles.badgeText, { color: "#1D4ED8" }]}>{p.enfants_count} enfant{p.enfants_count > 1 ? "s" : ""}</Text>
                        </View>
                      )}
                      {p.last_rdv_date && (
                        <View style={[styles.badge, { backgroundColor: "#F3E8FF" }]}>
                          <Ionicons name="calendar" size={10} color="#7E22CE" />
                          <Text style={[styles.badgeText, { color: "#7E22CE" }]}>
                            Dernier: {new Date(p.last_rdv_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>

              <View style={{ gap: 6 }}>
                {isCentre ? (
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: "#FEE2E2" }]}
                    onPress={() => removeMembre(p.id, p.name)}
                    testID={`remove-pro-${p.id}`}
                  >
                    <Ionicons name="close" size={18} color="#B91C1C" />
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => router.push(`/chat/${p.id}?name=${encodeURIComponent(p.name || "")}`)}
                      testID={`msg-patient-${p.id}`}
                    >
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                  </>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ icon, label, color, onPress }: any) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  headerBadge: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.pill },
  headerBadgeText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: RADIUS.pill, paddingHorizontal: 14, height: 40 },
  search: { flex: 1, color: "#fff", fontSize: 14 },

  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: SPACING.lg, marginTop: -12 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  statVal: { fontWeight: "800", fontSize: 22 },
  statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

  action: { alignItems: "center", gap: 4, width: 88 },
  actionIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "700", textAlign: "center" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 20 },
  name: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  specialite: { color: "#A855F7", fontSize: 12, fontWeight: "700", marginTop: 1 },
  meta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill },
  badgeText: { fontSize: 10, fontWeight: "800" },
  iconBtn: { width: 36, height: 36, backgroundColor: COLORS.primaryLight, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#FEE2E2", borderRadius: RADIUS.md, marginBottom: 14 },
  errorText: { flex: 1, color: "#B91C1C", fontSize: 12, fontWeight: "600" },

  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 20 },
});
