/**
 * Pro — Configuration des tarifs domicile (consultation + 3 zones + 3 majorations).
 */
import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";

export default function ProPricingDomicile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [v, setV] = useState<Record<string, string>>({
    tarif_consultation: "10000",
    frais_zone_proche: "2000",
    frais_zone_moyen: "5000",
    frais_zone_loin: "10000",
    majoration_nuit_fcfa: "0",
    majoration_we_fcfa: "0",
    majoration_urgence_fcfa: "5000",
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/pro/pricing-domicile");
        const d = r.data || {};
        setV({
          tarif_consultation: String(d.tarif_consultation ?? 10000),
          frais_zone_proche: String(d.frais_zone_proche ?? 2000),
          frais_zone_moyen: String(d.frais_zone_moyen ?? 5000),
          frais_zone_loin: String(d.frais_zone_loin ?? 10000),
          majoration_nuit_fcfa: String(d.majoration_nuit_fcfa ?? 0),
          majoration_we_fcfa: String(d.majoration_we_fcfa ?? 0),
          majoration_urgence_fcfa: String(d.majoration_urgence_fcfa ?? 5000),
        });
      } catch (e) { Alert.alert("Erreur", formatError(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const setK = (k: string, val: string) => setV((s) => ({ ...s, [k]: val.replace(/[^0-9]/g, "") }));

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const [k, val] of Object.entries(v)) {
      const n = parseInt(val || "0", 10);
      if (isNaN(n) || n < 0 || n > 500000) return Alert.alert("Valeur invalide", `${k} doit être entre 0 et 500 000 F.`);
      payload[k] = n;
    }
    setSaving(true);
    try {
      await api.put("/pro/pricing-domicile", payload);
      Alert.alert("✅ Sauvegardé", "Vos tarifs domicile sont actifs. Les patientes pourront vous proposer leur demande.");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Tarifs Domicile</Text>
        <View style={{ width: 32 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.banner}>
            <Ionicons name="information-circle" size={20} color="#1D4ED8" />
            <Text style={styles.bannerTxt}>Ces tarifs sont vos prix par défaut. À chaque demande reçue, vous pourrez les ajuster avant d'envoyer votre proposition.</Text>
          </View>

          <Section title="Tarif consultation">
            <Field label="Tarif de base (F CFA)" k="tarif_consultation" v={v} setK={setK} />
          </Section>

          <Section title="Frais de déplacement par zone">
            <Field label="Proche (≤ 5 km)" k="frais_zone_proche" v={v} setK={setK} />
            <Field label="Moyen (5–15 km)" k="frais_zone_moyen" v={v} setK={setK} />
            <Field label="Loin (> 15 km)" k="frais_zone_loin" v={v} setK={setK} />
          </Section>

          <Section title="Majorations automatiques">
            <Field label="Nuit (20h–7h)" k="majoration_nuit_fcfa" v={v} setK={setK} />
            <Field label="Week-end (Sam-Dim)" k="majoration_we_fcfa" v={v} setK={setK} />
            <Field label="Urgence (24/7)" k="majoration_urgence_fcfa" v={v} setK={setK} />
          </Section>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
            <Text style={styles.saveTxt}>{saving ? "Sauvegarde..." : "Enregistrer"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Field({ label, k, v, setK }: { label: string; k: string; v: Record<string, string>; setK: (k: string, val: string) => void }) {
  return (
    <View style={{ marginVertical: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={v[k]} onChangeText={(t) => setK(k, t)} keyboardType="number-pad" placeholderTextColor={COLORS.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: 12, justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  content: { padding: 16, gap: 12 },
  banner: { flexDirection: "row", padding: 12, gap: 6, backgroundColor: "#EFF6FF", borderRadius: RADIUS.md, alignItems: "flex-start" },
  bannerTxt: { flex: 1, fontSize: 12, color: "#1E3A8A", lineHeight: 17 },
  section: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, ...SHADOW },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  label: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4, fontWeight: "700" },
  input: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 8, fontSize: 13, color: COLORS.textPrimary },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: RADIUS.md, gap: 8, backgroundColor: COLORS.primary, marginTop: 8 },
  saveTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
