import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const RELATIONS = [
  { value: "partenaire", label: "Partenaire", icon: "💑" },
  { value: "parent", label: "Parent", icon: "👨‍👩‍👧" },
  { value: "belle_famille", label: "Belle-famille", icon: "👪" },
  { value: "ami", label: "Ami(e)", icon: "🤝" },
  { value: "autre", label: "Autre", icon: "👤" },
];

const PERM_LABELS: { id: string; label: string; icon: string }[] = [
  { id: "grossesse", label: "Suivi de grossesse", icon: "heart" },
  { id: "grossesse_details", label: "Détails grossesse", icon: "heart-circle" },
  { id: "enfants", label: "Carnets enfants", icon: "happy" },
  { id: "enfants_details", label: "Détails enfants", icon: "medkit" },
  { id: "rendez_vous", label: "Rendez-vous", icon: "calendar" },
  { id: "documents", label: "Documents", icon: "document-text" },
  { id: "messagerie", label: "Messagerie famille", icon: "chatbubbles" },
];

export default function FamillePage() {
  const router = useRouter();
  const [data, setData] = useState<{ owned: any; member_of: any[] }>({ owned: null, member_of: [] });
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState("");
  const [relation, setRelation] = useState("partenaire");
  const [memberSettings, setMemberSettings] = useState<any | null>(null);

  const load = async () => {
    try {
      const { data } = await api.get("/famille");
      setData(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const createGroup = async () => {
    try {
      await api.post("/famille/create");
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const joinGroup = async () => {
    if (!code) return;
    try {
      await api.post("/famille/join", { code: code.toUpperCase(), relation });
      setShowJoin(false);
      setCode("");
      Alert.alert("Demande envoyée", "Le propriétaire doit accepter votre demande");
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const updateMember = async (email: string, payload: any) => {
    try {
      await api.patch(`/famille/members/${email}`, payload);
      load();
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  const removeMember = (email: string) => {
    Alert.alert("Retirer ce membre ?", email, [
      { text: "Annuler" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          await api.delete(`/famille/members/${email}`);
          load();
        },
      },
    ]);
  };

  const shareCode = async (c: string) => {
    try {
      await Share.share({ message: `Rejoignez ma famille sur À lo Maman avec le code : ${c}` });
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const owned = data.owned;
  const memberOf = data.member_of || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Famille connectée</Text>
          <Text style={styles.sub}>Partagez avec vos proches en toute sécurité</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Mon groupe famille */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <LinearGradient colors={["#F472B6", "#A855F7"]} style={styles.cardIcon}>
                <Ionicons name="people" size={20} color="#fff" />
              </LinearGradient>
              <Text style={styles.cardTitle}>Mon groupe famille</Text>
            </View>
          </View>

          {!owned ? (
            <>
              <Text style={styles.cardDesc}>Créez votre groupe pour inviter vos proches.</Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={createGroup}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Créer mon groupe famille</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Code de partage</Text>
                <Text style={styles.codeValue}>{owned.code_partage}</Text>
                <TouchableOpacity style={styles.shareBtn} onPress={() => shareCode(owned.code_partage)}>
                  <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.shareBtnText}>Partager le code</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.subHeader}>Membres ({(owned.membres || []).length})</Text>
              {(owned.membres || []).length === 0 ? (
                <Text style={styles.emptyText}>Aucun membre encore</Text>
              ) : (
                (owned.membres || []).map((m: any) => (
                  <View key={m.email} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{(m.name || m.email).charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName} numberOfLines={1}>{m.name || m.email}</Text>
                      <Text style={styles.memberRelation}>
                        {RELATIONS.find((r) => r.value === m.relation)?.icon || "👤"}{" "}
                        {RELATIONS.find((r) => r.value === m.relation)?.label || m.relation}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              m.statut === "accepte" ? "#DCFCE7" : m.statut === "refuse" ? "#FEE2E2" : "#FEF3C7",
                            color:
                              m.statut === "accepte" ? "#166534" : m.statut === "refuse" ? "#991B1B" : "#92400E",
                          },
                        ]}
                      >
                        {m.statut}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {m.statut === "en_attente" && (
                          <>
                            <TouchableOpacity
                              onPress={() => updateMember(m.email, { statut: "accepte" })}
                              style={styles.iconBtnAccept}
                            >
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => updateMember(m.email, { statut: "refuse" })}
                              style={styles.iconBtnRefuse}
                            >
                              <Ionicons name="close" size={16} color="#fff" />
                            </TouchableOpacity>
                          </>
                        )}
                        <TouchableOpacity onPress={() => setMemberSettings(m)} style={styles.iconBtn}>
                          <Ionicons name="settings-outline" size={14} color={COLORS.textPrimary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeMember(m.email)} style={styles.iconBtnDelete}>
                          <Ionicons name="trash" size={14} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </View>

        {/* Rejoindre une famille */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <LinearGradient colors={["#F59E0B", "#EF4444"]} style={styles.cardIcon}>
                <Ionicons name="person-add" size={20} color="#fff" />
              </LinearGradient>
              <Text style={styles.cardTitle}>Rejoindre une famille</Text>
            </View>
          </View>
          <Text style={styles.cardDesc}>Vous avez reçu un code de partage ?</Text>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowJoin(true)}>
            <Ionicons name="key-outline" size={18} color={COLORS.primary} />
            <Text style={styles.btnSecondaryText}>Saisir un code</Text>
          </TouchableOpacity>

          {memberOf.length > 0 && (
            <>
              <Text style={[styles.subHeader, { marginTop: 14 }]}>Mes familles ({memberOf.length})</Text>
              {memberOf.map((f: any) => (
                <View key={f.id} style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Ionicons name="people" size={18} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{f.owner_name || f.owner_email}</Text>
                    <Text style={styles.memberRelation}>Famille de {f.owner_email}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Modal rejoindre */}
      <Modal visible={showJoin} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Rejoindre une famille</Text>
              <TouchableOpacity onPress={() => setShowJoin(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Code de partage</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              placeholder="ABCD12"
              placeholderTextColor={COLORS.textMuted}
              maxLength={8}
            />
            <Text style={styles.label}>Votre relation</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {RELATIONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => setRelation(r.value)}
                  style={[
                    styles.relPill,
                    relation === r.value && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                  ]}
                >
                  <Text style={[styles.relPillText, relation === r.value && { color: "#fff" }]}>
                    {r.icon} {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 20 }]} onPress={joinGroup}>
              <Text style={styles.btnPrimaryText}>Envoyer la demande</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal permissions membre */}
      <Modal visible={!!memberSettings} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <ScrollView>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Permissions de {memberSettings?.name || memberSettings?.email}</Text>
                <TouchableOpacity onPress={() => setMemberSettings(null)}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
              {PERM_LABELS.map((p) => {
                const enabled = !!memberSettings?.permissions?.[p.id];
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      const newPerms = { ...(memberSettings?.permissions || {}), [p.id]: !enabled };
                      setMemberSettings({ ...memberSettings, permissions: newPerms });
                      updateMember(memberSettings.email, { permissions: newPerms });
                    }}
                    style={styles.permRow}
                  >
                    <Ionicons name={p.icon as any} size={20} color={enabled ? COLORS.primary : COLORS.textMuted} />
                    <Text style={[styles.permLabel, enabled && { color: COLORS.textPrimary }]}>{p.label}</Text>
                    <View style={[styles.toggle, enabled && { backgroundColor: COLORS.primary }]}>
                      <View style={[styles.toggleDot, enabled && { transform: [{ translateX: 18 }] }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, ...SHADOW },
  cardHead: { marginBottom: 10 },
  cardHeadLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  cardDesc: { color: COLORS.textSecondary, fontSize: 13, marginVertical: 8 },

  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.pill, marginTop: 8 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.primary, marginTop: 8 },
  btnSecondaryText: { color: COLORS.primary, fontWeight: "700", fontSize: 14 },

  codeBox: { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: 14, alignItems: "center", marginVertical: 8 },
  codeLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700", letterSpacing: 1 },
  codeValue: { fontSize: 28, fontWeight: "800", color: COLORS.primary, letterSpacing: 4, marginVertical: 6 },
  shareBtn: { flexDirection: "row", gap: 6, alignItems: "center" },
  shareBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },

  subHeader: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, marginTop: 14, marginBottom: 8, letterSpacing: 1 },
  emptyText: { fontStyle: "italic", color: COLORS.textMuted, paddingVertical: 8 },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { color: COLORS.primary, fontWeight: "800" },
  memberName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  memberRelation: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  statusBadge: { fontSize: 9, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, textTransform: "uppercase" },
  iconBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.bgSecondary, alignItems: "center", justifyContent: "center" },
  iconBtnAccept: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center" },
  iconBtnRefuse: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.error, alignItems: "center", justifyContent: "center" },
  iconBtnDelete: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: "92%" },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, flex: 1 },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, color: COLORS.textPrimary, fontSize: 18, letterSpacing: 4, textAlign: "center", fontWeight: "800" },
  relPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  relPillText: { fontSize: 12, fontWeight: "600", color: COLORS.textPrimary },

  permRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  permLabel: { flex: 1, color: COLORS.textSecondary, fontWeight: "600", fontSize: 14 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: COLORS.border, padding: 3 },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
});
