/**
 * Ligne d'écoute post-partum 📞 — Soutien psychologique et urgences.
 * Réservé aux Mamans (avec section Premium dédiée).
 * Route: /ligne-ecoute
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import PremiumGate from "../components/PremiumGate";

export default function LigneEcoute() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [pref, setPref] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/ecoute/contacts");
      setData(r.data);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
  const openWhatsApp = (url: string) => Linking.openURL(url).catch(() => Alert.alert("WhatsApp", "Impossible d'ouvrir WhatsApp."));
  const sendEmail = (email: string) => Linking.openURL(`mailto:${email}?subject=${encodeURIComponent("Demande d'écoute post-partum")}`);

  const submitBooking = async () => {
    if (!motif.trim()) {
      Alert.alert("Champ requis", "Veuillez décrire brièvement votre motif.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post("/ecoute/sessions", { motif, preference_horaire: pref });
      Alert.alert("Demande envoyée ✅", r.data?.message || "Notre équipe vous contactera sous 2h.");
      setBookingOpen(false);
      setMotif("");
      setPref("");
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        Alert.alert("Premium requis 💎", detail.message, [
          { text: "Plus tard", style: "cancel" },
          { text: "Devenir Premium", onPress: () => router.push("/premium") },
        ]);
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;
  if (!data) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EC4899", "#BE185D"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ligne d'écoute 📞</Text>
          <Text style={styles.sub}>Soutien post-partum et urgences</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {/* Premium dédié */}
        {data.premium_dedicated ? (
          <View style={styles.premBlock}>
            <View style={styles.premHeader}>
              <Ionicons name="diamond" size={22} color="#fff" />
              <Text style={styles.premTitle}>{data.premium_dedicated.label}</Text>
            </View>
            <Text style={styles.premHoraires}>{data.premium_dedicated.horaires}</Text>
            <Text style={styles.premSpecLabel}>Spécialités :</Text>
            <View style={styles.specRow}>
              {(data.premium_dedicated.specialites || []).map((s: string) => (
                <View key={s} style={styles.specChip}><Text style={styles.specChipText}>{s}</Text></View>
              ))}
            </View>
            <View style={styles.premActions}>
              <TouchableOpacity style={[styles.premBtn, { backgroundColor: "#10B981" }]} onPress={() => openWhatsApp(data.premium_dedicated.whatsapp)}>
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={styles.premBtnText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.premBtn, { backgroundColor: "#3B82F6" }]} onPress={() => call(data.premium_dedicated.phone)}>
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.premBtnText}>Appeler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.premBtn, { backgroundColor: "#A855F7" }]} onPress={() => sendEmail(data.premium_dedicated.email)}>
                <Ionicons name="mail" size={18} color="#fff" />
                <Text style={styles.premBtnText}>Email</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.bookBtn} onPress={() => setBookingOpen(true)}>
              <Ionicons name="calendar" size={16} color="#fff" />
              <Text style={styles.bookBtnText}>Réserver une session d'écoute</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <PremiumGate
            message={data.premium_required?.message || "Réservé Premium."}
            color="#EC4899"
            ctaLabel="Devenir Maman Premium"
            benefits="Avec Maman Premium : ligne d'écoute 7j/7 · réponse < 2h · spécialistes baby blues, allaitement, sommeil."
          />
        )}

        {/* Urgences */}
        <Text style={styles.sectionTitle}>🚨 Urgences 24/7 (gratuit)</Text>
        {(data.urgences_24_7 || []).map((c: any) => (
          <TouchableOpacity key={c.label} style={styles.contactRow} onPress={() => call(c.phone)}>
            <View style={[styles.iconCircle, { backgroundColor: "#EF4444" }]}>
              <Ionicons name={c.icon} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactName}>{c.label}</Text>
              <Text style={styles.contactPhone}>{c.phone}</Text>
            </View>
            <Ionicons name="call" size={18} color="#EF4444" />
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>📞 Lignes publiques d'aide</Text>
        {(data.lignes_publiques || []).map((c: any) => (
          <TouchableOpacity key={c.label} style={styles.contactRow} onPress={() => call(c.phone)}>
            <View style={[styles.iconCircle, { backgroundColor: "#3B82F6" }]}>
              <Ionicons name={c.icon} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactName}>{c.label}</Text>
              <Text style={styles.contactPhone}>{c.phone}</Text>
            </View>
            <Ionicons name="call" size={18} color="#3B82F6" />
          </TouchableOpacity>
        ))}

        <Text style={styles.disclaimer}>
          📝 Tous les appels sont confidentiels. En cas de pensées noires ou d'angoisse aiguë, appelez immédiatement le 185 ou rendez-vous aux urgences les plus proches.
        </Text>
      </ScrollView>

      {/* Modale de réservation */}
      <Modal visible={bookingOpen} transparent animationType="slide" onRequestClose={() => setBookingOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Réserver une session</Text>
              <TouchableOpacity onPress={() => setBookingOpen(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.lbl}>Motif (obligatoire)</Text>
            <TextInput
              style={[styles.input, { height: 90 }]}
              multiline
              placeholder="Ex : Baby blues persistant, difficultés d'allaitement…"
              placeholderTextColor={COLORS.textMuted}
              value={motif}
              onChangeText={setMotif}
            />
            <Text style={styles.lbl}>Préférence horaire (facultatif)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : matin entre 9h et 11h"
              placeholderTextColor={COLORS.textMuted}
              value={pref}
              onChangeText={setPref}
            />
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} disabled={submitting} onPress={submitBooking}>
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitText}>Envoyer la demande</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  premBlock: { backgroundColor: "#FCE7F3", padding: 16, borderRadius: RADIUS.lg, marginBottom: 20, borderWidth: 1, borderColor: "#F9A8D4" },
  premHeader: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EC4899", padding: 10, borderRadius: 8, marginBottom: 8 },
  premTitle: { color: "#fff", fontWeight: "800", fontSize: 14, flex: 1 },
  premHoraires: { fontSize: 12, color: "#9F1239", marginBottom: 12, fontWeight: "700" },
  premSpecLabel: { fontSize: 11, color: "#9F1239", fontWeight: "700", marginBottom: 6 },
  specRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  specChip: { backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "#F9A8D4" },
  specChipText: { fontSize: 10, color: "#9F1239", fontWeight: "600" },
  premActions: { flexDirection: "row", gap: 6, marginBottom: 10 },
  premBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 10, borderRadius: 8 },
  premBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, backgroundColor: "#7C3AED", borderRadius: 8 },
  bookBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  contactName: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
  contactPhone: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 16, lineHeight: 16, paddingHorizontal: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", padding: SPACING.lg, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  lbl: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 8, fontSize: 13, color: COLORS.textPrimary, marginBottom: 12, backgroundColor: "#FAFAFA" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, backgroundColor: "#EC4899", borderRadius: 10 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
