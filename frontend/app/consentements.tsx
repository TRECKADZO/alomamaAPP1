/**
 * Consentements granulaires — Maman pilote qui voit quoi.
 * Route: /consentements
 *
 * Permet de :
 *  - Voir tous ses consents donnés (actifs/révoqués/expirés)
 *  - Créer un nouveau consent : choisir Pro + cocher catégories + expiration
 *  - Modifier un consent existant
 *  - Révoquer ou supprimer
 */
import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

type Consent = {
  id: string;
  pro_id: string;
  pro_name: string;
  pro_specialite?: string;
  categories: string[];
  expires_at?: string;
  notes?: string;
  status: "active" | "revoked";
  created_at: string;
  revoked_at?: string;
};

const CATEGORY_INFO: Record<string, { label: string; icon: string; color: string; emoji: string }> = {
  patient_info: { label: "Identité (nom, photo, CMU)", icon: "person", color: "#3B82F6", emoji: "👤" },
  vaccins: { label: "Vaccins", icon: "medical", color: "#10B981", emoji: "💉" },
  croissance: { label: "Croissance (poids, taille)", icon: "trending-up", color: "#0EA5E9", emoji: "📈" },
  echos: { label: "Échographies", icon: "scan", color: "#8B5CF6", emoji: "🔬" },
  consultation_notes: { label: "Notes de consultation", icon: "reader", color: "#06B6D4", emoji: "📝" },
  dmp: { label: "Suivi développement (DMP)", icon: "sparkles", color: "#A855F7", emoji: "🧠" },
  birth_declaration: { label: "Acte de naissance", icon: "balloon", color: "#EC4899", emoji: "👶" },
  allergies: { label: "Allergies", icon: "warning", color: "#EF4444", emoji: "⚠️" },
  messages: { label: "Conversations", icon: "chatbubbles", color: "#F59E0B", emoji: "💬" },
  rdv: { label: "Rendez-vous", icon: "calendar", color: "#6366F1", emoji: "📅" },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_INFO);

export default function ConsentementsScreen() {
  const router = useRouter();
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Consent | null>(null);
  const [pros, setPros] = useState<any[]>([]);
  const [selectedPro, setSelectedPro] = useState<any>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [expiryDays, setExpiryDays] = useState<string>("30");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/consents/me");
      setConsents(r.data.consents || []);
    } catch (e) {
      console.error("Consents load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPros = async () => {
    try {
      // Récupère les pros avec qui la maman a déjà eu un RDV
      const r = await api.get("/rdv");
      const proIds = Array.from(new Set((r.data || []).map((rdv: any) => rdv.pro_id).filter(Boolean)));
      const pros: any[] = [];
      for (const pid of proIds) {
        try {
          const pr = await api.get(`/users/${pid}/public`);
          pros.push(pr.data);
        } catch {}
      }
      setPros(pros);
    } catch (e) {
      console.error("Pros load", e);
    }
  };

  useFocusEffect(useCallback(() => { load(); loadPros(); }, []));

  const openModal = (c?: Consent) => {
    if (c) {
      setEditing(c);
      setSelectedPro({ id: c.pro_id, name: c.pro_name, specialite: c.pro_specialite });
      setSelectedCats(c.categories);
      // Reverse expiry days
      if (c.expires_at) {
        try {
          const exp = new Date(c.expires_at);
          const now = new Date();
          const days = Math.max(1, Math.round((exp.getTime() - now.getTime()) / (24 * 3600 * 1000)));
          setExpiryDays(String(days));
        } catch {
          setExpiryDays("30");
        }
      } else {
        setExpiryDays("0");
      }
    } else {
      setEditing(null);
      setSelectedPro(null);
      setSelectedCats(["patient_info", "rdv"]);
      setExpiryDays("30");
    }
    setShowModal(true);
  };

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  const saveConsent = async () => {
    if (!selectedPro?.id) {
      Alert.alert("Pro requis", "Choisissez un professionnel");
      return;
    }
    if (selectedCats.length === 0) {
      Alert.alert("Catégories requises", "Sélectionnez au moins une catégorie de données");
      return;
    }
    setSubmitting(true);
    try {
      const days = parseInt(expiryDays || "0", 10);
      const expires_at = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : undefined;
      const body: any = { pro_id: selectedPro.id, categories: selectedCats, expires_at };
      if (editing) {
        await api.patch(`/consents/${editing.id}`, body);
      } else {
        await api.post("/consents", body);
      }
      setShowModal(false);
      load();
      Alert.alert("✅ Consentement", editing ? "Mis à jour avec succès" : "Créé avec succès");
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Impossible d'enregistrer");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = (c: Consent) => {
    Alert.alert("Révoquer ce consentement ?",
      `${c.pro_name} ne pourra plus accéder à vos données partagées.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Révoquer", style: "destructive", onPress: async () => {
          try {
            await api.post(`/consents/${c.id}/revoke`);
            load();
          } catch { Alert.alert("Erreur", "Révocation impossible"); }
        }},
      ]
    );
  };

  const remove = (c: Consent) => {
    Alert.alert("Supprimer ce consentement ?",
      "Cette action est définitive.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: async () => {
          try {
            await api.delete(`/consents/${c.id}`);
            load();
          } catch { Alert.alert("Erreur", "Suppression impossible"); }
        }},
      ]
    );
  };

  const isExpired = (c: Consent) => {
    if (!c.expires_at) return false;
    try { return new Date(c.expires_at) < new Date(); } catch { return false; }
  };

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  }

  const active = consents.filter((c) => c.status === "active" && !isExpired(c));
  const inactive = consents.filter((c) => c.status !== "active" || isExpired(c));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🔐 Consentements</Text>
          <Text style={styles.sub}>Vous décidez qui voit quoi</Text>
        </View>
        <TouchableOpacity onPress={() => openModal()} style={styles.addBtn} testID="btn-new-consent">
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* CTA explication */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#0EA5E9" />
          <Text style={styles.infoText}>
            Chaque pro ne voit que les <Text style={{ fontWeight: "800" }}>catégories</Text> que vous lui partagez. Vous pouvez révoquer à tout moment.
          </Text>
        </View>

        {/* Lien vers audit log */}
        <TouchableOpacity style={styles.auditLinkCard} onPress={() => router.push("/audit-log")}>
          <View style={[styles.auditIcon, { backgroundColor: "#6366F11F" }]}>
            <Ionicons name="search" size={18} color="#6366F1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.auditTitle}>🔍 Voir le journal d'accès</Text>
            <Text style={styles.auditSub}>Qui a vu mes données et quand</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* CONSENTS ACTIFS */}
        <Text style={styles.sectionTitle}>✅ Consentements actifs ({active.length})</Text>
        {active.length === 0 ? (
          <Text style={styles.empty}>Aucun consentement actif. Cliquez sur + pour en créer un.</Text>
        ) : (
          active.map((c) => <ConsentCard key={c.id} c={c} onEdit={() => openModal(c)} onRevoke={() => revoke(c)} onDelete={() => remove(c)} isExpired={false} />)
        )}

        {/* CONSENTS INACTIFS */}
        {inactive.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>📁 Historique ({inactive.length})</Text>
            {inactive.map((c) => <ConsentCard key={c.id} c={c} onEdit={() => openModal(c)} onRevoke={() => revoke(c)} onDelete={() => remove(c)} isExpired={isExpired(c)} />)}
          </>
        )}
      </ScrollView>

      {/* MODAL CRÉER/EDIT */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={26} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editing ? "Modifier" : "Nouveau consentement"}</Text>
            <TouchableOpacity onPress={saveConsent} disabled={submitting}>
              {submitting ? <ActivityIndicator /> : <Text style={styles.saveText}>Enregistrer</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
            {/* Sélection Pro */}
            <Text style={styles.formLabel}>👨‍⚕️ Professionnel concerné</Text>
            {editing ? (
              <View style={styles.proPickedCard}>
                <Text style={styles.proPickedName}>{selectedPro?.name}</Text>
                <Text style={styles.proPickedSpec}>{selectedPro?.specialite || "—"}</Text>
              </View>
            ) : pros.length === 0 ? (
              <Text style={styles.empty}>Aucun pro avec qui vous avez eu un RDV. Prenez d'abord rendez-vous avec un pro.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {pros.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.proCard, selectedPro?.id === p.id && { borderColor: "#10B981", borderWidth: 2, backgroundColor: "#10B98115" }]}
                    onPress={() => setSelectedPro(p)}
                    testID={`pro-${p.id}`}
                  >
                    <View style={styles.proAvatar}><Ionicons name="person" size={18} color="#10B981" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.proName}>{p.name}</Text>
                      <Text style={styles.proSpec}>{p.specialite || "—"}</Text>
                    </View>
                    {selectedPro?.id === p.id && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Catégories */}
            <Text style={[styles.formLabel, { marginTop: 24 }]}>📂 Données à partager</Text>
            <Text style={styles.formSub}>Cochez ce que ce pro pourra voir</Text>
            <View style={{ gap: 6 }}>
              {ALL_CATEGORIES.map((cat) => {
                const info = CATEGORY_INFO[cat];
                const checked = selectedCats.includes(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catRow, checked && { borderColor: info.color, borderWidth: 2, backgroundColor: `${info.color}10` }]}
                    onPress={() => toggleCat(cat)}
                    testID={`cat-${cat}`}
                  >
                    <Text style={{ fontSize: 22 }}>{info.emoji}</Text>
                    <Text style={[styles.catLabel, checked && { fontWeight: "800" }]}>{info.label}</Text>
                    <View style={[styles.checkbox, checked && { backgroundColor: info.color, borderColor: info.color }]}>
                      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Expiration */}
            <Text style={[styles.formLabel, { marginTop: 24 }]}>⏱️ Durée du consentement</Text>
            <Text style={styles.formSub}>En jours (0 = sans expiration)</Text>
            <TextInput
              style={styles.input}
              value={expiryDays}
              onChangeText={setExpiryDays}
              keyboardType="number-pad"
              placeholder="30"
            />
            <View style={styles.quickRow}>
              {["7", "30", "90", "0"].map((d) => (
                <TouchableOpacity key={d} style={[styles.quickBtn, expiryDays === d && { backgroundColor: "#10B981" }]} onPress={() => setExpiryDays(d)}>
                  <Text style={[styles.quickText, expiryDays === d && { color: "#fff" }]}>
                    {d === "0" ? "∞ Toujours" : `${d} j`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ConsentCard({ c, onEdit, onRevoke, onDelete, isExpired }: any) {
  const isActive = c.status === "active" && !isExpired;
  return (
    <View style={[styles.consentCard, !isActive && { opacity: 0.65 }]}>
      <View style={styles.consentTop}>
        <View style={[styles.consentAvatar, { backgroundColor: isActive ? "#10B98122" : COLORS.border }]}>
          <Text style={{ fontSize: 18 }}>{isActive ? "👨‍⚕️" : isExpired ? "⏱️" : "🚫"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.consentPro}>{c.pro_name}</Text>
          <Text style={styles.consentSpec}>{c.pro_specialite || "—"}</Text>
        </View>
        <View style={[styles.statusBadge, isActive ? styles.badgeActive : styles.badgeInactive]}>
          <Text style={[styles.statusText, isActive ? { color: "#10B981" } : { color: COLORS.textMuted }]}>
            {isActive ? "Actif" : isExpired ? "Expiré" : "Révoqué"}
          </Text>
        </View>
      </View>

      <View style={styles.catsRow}>
        {c.categories.map((cat: string) => {
          const info = CATEGORY_INFO[cat];
          if (!info) return null;
          return (
            <View key={cat} style={[styles.catChip, { backgroundColor: `${info.color}15`, borderColor: info.color }]}>
              <Text style={{ fontSize: 11 }}>{info.emoji}</Text>
              <Text style={[styles.catChipText, { color: info.color }]}>{info.label.split(" ")[0]}</Text>
            </View>
          );
        })}
      </View>

      {c.expires_at && (
        <Text style={styles.expiry}>
          ⏱️ {isExpired ? "Expiré le" : "Expire le"} {new Date(c.expires_at).toLocaleDateString("fr-FR")}
        </Text>
      )}

      {isActive && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#3B82F6" }]} onPress={onEdit}>
            <Ionicons name="create" size={14} color="#fff" />
            <Text style={styles.actionText}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]} onPress={onRevoke}>
            <Ionicons name="close-circle" size={14} color="#fff" />
            <Text style={styles.actionText}>Révoquer</Text>
          </TouchableOpacity>
        </View>
      )}
      {!isActive && (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#EF4444", marginTop: 8, alignSelf: "flex-end" }]} onPress={onDelete}>
          <Ionicons name="trash" size={14} color="#fff" />
          <Text style={styles.actionText}>Supprimer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  infoCard: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#0EA5E915", borderRadius: RADIUS.md, marginBottom: 12, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, color: COLORS.textPrimary, lineHeight: 17 },

  auditLinkCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  auditIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  auditTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  auditSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  empty: { textAlign: "center", color: COLORS.textMuted, fontStyle: "italic", padding: 14, fontSize: 12 },

  consentCard: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, ...SHADOW },
  consentTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  consentAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  consentPro: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  consentSpec: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeActive: { backgroundColor: "#10B98122" },
  badgeInactive: { backgroundColor: COLORS.border },
  statusText: { fontSize: 11, fontWeight: "800" },

  catsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 10 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  catChipText: { fontSize: 10, fontWeight: "700" },

  expiry: { fontSize: 11, color: COLORS.textMuted, marginTop: 8 },

  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  actionText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  saveText: { color: "#10B981", fontSize: 14, fontWeight: "800" },

  formLabel: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  formSub: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },

  proCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  proAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#10B98115", alignItems: "center", justifyContent: "center" },
  proName: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  proSpec: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  proPickedCard: { padding: 12, borderRadius: RADIUS.md, backgroundColor: "#10B98115", borderWidth: 2, borderColor: "#10B981" },
  proPickedName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  proPickedSpec: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  catRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  catLabel: { flex: 1, fontSize: 13, color: COLORS.textPrimary },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },

  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.surface },
  quickRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  quickBtn: { flex: 1, padding: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  quickText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
});
