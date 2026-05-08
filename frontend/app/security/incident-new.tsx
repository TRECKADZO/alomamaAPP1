/**
 * Déclaration d'incident de sécurité — RGSSI N3 B.14
 * Route: /security/incident-new
 */
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const SEVERITIES = [
  { key: "low", label: "Faible", color: "#10B981", emoji: "🟢", desc: "Anomalie mineure sans impact" },
  { key: "medium", label: "Moyenne", color: "#F59E0B", emoji: "🟡", desc: "Risque limité, nécessite enquête" },
  { key: "high", label: "Élevée", color: "#F97316", emoji: "🟠", desc: "Notification ANSSI requise sous 72h" },
  { key: "critical", label: "Critique", color: "#EF4444", emoji: "🔴", desc: "Fuite massive, état civil compromis — ANSSI immédiat" },
];

const CATEGORIES = [
  { key: "breach", label: "Fuite/violation de données", emoji: "💧" },
  { key: "unauthorized_access", label: "Accès non autorisé", emoji: "🚪" },
  { key: "data_corruption", label: "Corruption de données", emoji: "📉" },
  { key: "suspicious_activity", label: "Activité suspecte", emoji: "👁️" },
  { key: "phishing", label: "Phishing / Hameçonnage", emoji: "🎣" },
  { key: "ddos", label: "DDoS / Déni de service", emoji: "🌊" },
  { key: "malware", label: "Malware / Ransomware", emoji: "🦠" },
  { key: "physical", label: "Vol/perte d'équipement", emoji: "📱" },
  { key: "other", label: "Autre", emoji: "❓" },
];

export default function IncidentNew() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [category, setCategory] = useState("suspicious_activity");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Champs requis", "Le titre et la description sont obligatoires.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post("/incidents", { title, description, severity, category });
      const sevConf = SEVERITIES.find((s) => s.key === severity);
      Alert.alert(
        "✅ Incident déclaré",
        `Référence : ${r.data.id.slice(0, 8)}…\n${sevConf?.emoji} Sévérité ${sevConf?.label}.${r.data.anssi_notification_required ? "\n\n⚠️ L'ANSSI sera notifiée dans les 72h." : ""}`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Déclaration impossible");
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EF4444", "#DC2626"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🚨 Déclarer un incident</Text>
          <Text style={styles.sub}>RGSSI N3 — Article B.14</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <View style={styles.warning}>
          <Ionicons name="warning" size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            En cas de doute, déclarez. Les fausses alertes sont préférables aux incidents non remontés.
          </Text>
        </View>

        <Text style={styles.label}>Titre *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Tentative de connexion suspecte"
          placeholderTextColor={COLORS.textMuted}
          testID="input-title"
        />

        <Text style={styles.label}>Description détaillée *</Text>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Que s'est-il passé ? Quand ? Qui a été impacté ?"
          placeholderTextColor={COLORS.textMuted}
          multiline
          testID="input-description"
        />

        <Text style={styles.label}>Sévérité *</Text>
        {SEVERITIES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.optionRow, severity === s.key && { borderColor: s.color, borderWidth: 2, backgroundColor: `${s.color}10` }]}
            onPress={() => setSeverity(s.key)}
            testID={`sev-${s.key}`}
          >
            <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionLabel, { color: s.color }]}>{s.label}</Text>
              <Text style={styles.optionDesc}>{s.desc}</Text>
            </View>
            {severity === s.key && <Ionicons name="checkmark-circle" size={20} color={s.color} />}
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Catégorie *</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.catBtn, category === c.key && { backgroundColor: "#EF4444", borderColor: "#EF4444" }]}
              onPress={() => setCategory(c.key)}
              testID={`cat-${c.key}`}
            >
              <Text style={[styles.catText, category === c.key && { color: "#fff" }]}>{c.emoji} {c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btnSubmit} onPress={submit} disabled={submitting} testID="btn-submit-incident">
          {submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={18} color="#fff" /><Text style={styles.btnText}>Déclarer l'incident</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  warning: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, borderLeftWidth: 3, borderLeftColor: "#F59E0B", marginBottom: 16, alignItems: "flex-start" },
  warningText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  label: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.surface },

  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  optionLabel: { fontSize: 13, fontWeight: "800" },
  optionDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catBtn: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  catText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },

  btnSubmit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", padding: 14, borderRadius: RADIUS.md, marginTop: 24, ...SHADOW },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
