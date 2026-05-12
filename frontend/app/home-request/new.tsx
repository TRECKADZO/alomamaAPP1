/**
 * Maman — Créer une demande de soins à domicile ou urgence.
 */
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";

const ZONES = [
  { id: "proche", label: "Proche (≤ 5 km)", icon: "location" as const },
  { id: "moyen", label: "Moyen (5–15 km)", icon: "navigate" as const },
  { id: "loin", label: "Loin (> 15 km)", icon: "earth" as const },
];

const MODES = [
  { id: "presentiel" as const, label: "Au cabinet", icon: "business" as const, color: "#3B82F6" },
  { id: "teleconsultation" as const, label: "Téléconsultation", icon: "videocam" as const, color: "#8B5CF6" },
  { id: "domicile" as const, label: "À domicile", icon: "home" as const, color: "#F59E0B" },
];

export default function NewHomeRequest() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = (params.type === "urgence" ? "urgence" : "domicile") as "domicile" | "urgence";
  const isUrgence = type === "urgence";
  const color = isUrgence ? "#DC2626" : "#F59E0B";

  // Mode : pour type=domicile c'est forcément "domicile"; pour urgence, la maman choisit
  const [mode, setMode] = useState<"presentiel" | "teleconsultation" | "domicile">(isUrgence ? "presentiel" : "domicile");
  const needsAddress = mode === "domicile";

  const [motif, setMotif] = useState("");
  const [adresse, setAdresse] = useState("");
  const [quartier, setQuartier] = useState("");
  const [ville, setVille] = useState("");
  const [zone, setZone] = useState("moyen");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (motif.trim().length < 3) return Alert.alert("Motif requis", "Décrivez brièvement votre besoin.");
    if (needsAddress && adresse.trim().length < 5) return Alert.alert("Adresse requise", "Pour un soin à domicile, indiquez votre adresse précise.");
    setSubmitting(true);
    try {
      const body: any = {
        type,
        mode,
        motif: motif.trim(),
        preferred_datetime: preferredDate || null,
        notes: notes.trim(),
      };
      if (needsAddress) {
        body.adresse = adresse.trim();
        body.quartier = quartier.trim();
        body.ville = ville.trim();
        body.zone = zone;
      } else {
        body.ville = ville.trim();
      }
      const r = await api.post("/home-request", body);
      Alert.alert(
        "✅ Demande envoyée",
        `Votre demande a été envoyée à ${r.data?.broadcast_count || 0} professionnel(s). Vous serez notifiée dès qu'une offre arrive.`,
        [{ text: "Voir mes demandes", onPress: () => router.replace("/home-request") }],
      );
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isUrgence ? "🆘 Urgence à domicile" : "🏠 Soins à domicile"}</Text>
        <View style={{ width: 32 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.banner, { backgroundColor: color }]}>
            <Ionicons name={isUrgence ? "warning" : "home"} size={22} color="#fff" />
            <Text style={styles.bannerTxt}>{isUrgence ? "Demande prioritaire. Tous les pros disponibles seront notifiés immédiatement." : "Votre demande sera envoyée aux pros de la zone. Vous comparerez les offres avant de payer."}</Text>
          </View>

          <Text style={styles.label}>Motif (que ressentez-vous ?) *</Text>
          <TextInput style={styles.input} value={motif} onChangeText={setMotif} placeholder="Ex: Fièvre 39°, douleurs ventre, suivi grossesse..." multiline numberOfLines={2} placeholderTextColor={COLORS.textMuted} />

          {/* 🆘 Sélecteur de mode pour URGENCES uniquement */}
          {isUrgence && (
            <>
              <Text style={styles.label}>Mode de consultation souhaité *</Text>
              <View style={styles.modesRow}>
                {MODES.map((m) => {
                  const active = mode === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      testID={`mode-${m.id}`}
                      onPress={() => setMode(m.id)}
                      style={[styles.modeBtn, active && { backgroundColor: m.color, borderColor: m.color }]}
                    >
                      <Ionicons name={m.icon} size={16} color={active ? "#fff" : m.color} />
                      <Text style={[styles.modeTxt, active && { color: "#fff" }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                💡 {mode === "domicile" ? "Le pro vient chez vous" : mode === "teleconsultation" ? "Consultation vidéo immédiate" : "Vous vous rendez au cabinet sans RDV"}
              </Text>
            </>
          )}

          {/* Champs adresse — uniquement si mode=domicile */}
          {needsAddress ? (
            <>
              <Text style={styles.label}>Adresse complète *</Text>
              <TextInput style={styles.input} value={adresse} onChangeText={setAdresse} placeholder="Ex: Cocody Riviera 3, Rue des Jardins, Villa 12" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.hint}>🔒 Chiffré, révélé au pro après paiement uniquement</Text>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Quartier</Text>
                  <TextInput style={styles.input} value={quartier} onChangeText={setQuartier} placeholder="Cocody" placeholderTextColor={COLORS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Ville</Text>
                  <TextInput style={styles.input} value={ville} onChangeText={setVille} placeholder="Abidjan" placeholderTextColor={COLORS.textMuted} />
                </View>
              </View>

              <Text style={styles.label}>Zone (distance estimée Pro → vous)</Text>
              <View style={styles.zones}>
                {ZONES.map((z) => (
                  <TouchableOpacity key={z.id} onPress={() => setZone(z.id)} style={[styles.zoneBtn, zone === z.id && { backgroundColor: color, borderColor: color }]}>
                    <Ionicons name={z.icon} size={16} color={zone === z.id ? "#fff" : COLORS.textPrimary} />
                    <Text style={[styles.zoneTxt, zone === z.id && { color: "#fff" }]}>{z.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            // Cabinet / Téléconsultation : juste la ville
            <>
              <Text style={styles.label}>Ville (pour trouver un pro proche)</Text>
              <TextInput style={styles.input} value={ville} onChangeText={setVille} placeholder="Abidjan" placeholderTextColor={COLORS.textMuted} />
            </>
          )}

          {!isUrgence && (
            <>
              <Text style={styles.label}>Date/heure souhaitée (optionnel)</Text>
              <TextInput style={styles.input} value={preferredDate} onChangeText={setPreferredDate} placeholder="Ex: 2026-05-15T10:00 (ISO 8601)" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.hint}>Laissez vide pour "dès que possible".</Text>
            </>
          )}

          <Text style={styles.label}>Notes complémentaires (allergies, antécédents...)</Text>
          <TextInput style={[styles.input, { minHeight: 70 }]} value={notes} onChangeText={setNotes} placeholder="Optionnel" multiline placeholderTextColor={COLORS.textMuted} />

          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: color }, submitting && { opacity: 0.5 }]} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            <Text style={styles.submitTxt}>{submitting ? "Envoi..." : "Envoyer la demande"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  banner: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: RADIUS.md, gap: 8, marginBottom: 8 },
  bannerTxt: { flex: 1, color: "#fff", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8, marginBottom: 4 },
  hint: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, fontStyle: "italic" },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: RADIUS.md, fontSize: 13, color: COLORS.textPrimary },
  row: { flexDirection: "row", gap: 8 },
  zones: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  zoneBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  zoneTxt: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },
  modesRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  modeTxt: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: RADIUS.md, gap: 8, marginTop: 16 },
  submitTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
