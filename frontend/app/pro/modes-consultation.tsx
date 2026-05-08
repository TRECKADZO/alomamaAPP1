/**
 * Modes de consultation 🎯 — Pro configure les modes qu'il accepte + frais déplacement.
 * Route: /pro/modes-consultation
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function ProModesConsultation() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tele, setTele] = useState(true);
  const [domicile, setDomicile] = useState(false);
  const [frais, setFrais] = useState<string>("2000");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/pro/modes-consultation");
      setTele(!!r.data?.accepte_teleconsultation);
      setDomicile(!!r.data?.accepte_domicile);
      if (r.data?.frais_deplacement_fcfa != null) {
        setFrais(String(r.data.frais_deplacement_fcfa));
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const fraisNum = parseInt(frais || "0", 10);
    if (domicile && (isNaN(fraisNum) || fraisNum < 0 || fraisNum > 50000)) {
      return Alert.alert("Frais invalides", "Le supplément déplacement doit être entre 0 et 50 000 F CFA.");
    }
    setSaving(true);
    try {
      await api.put("/pro/modes-consultation", {
        accepte_presentiel: true,
        accepte_teleconsultation: tele,
        accepte_domicile: domicile,
        frais_deplacement_fcfa: domicile ? fraisNum : null,
      });
      Alert.alert("✅ Sauvegardé", "Vos modes de consultation ont été mis à jour. Les mamans peuvent désormais filtrer leur recherche selon vos préférences.");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Modes de consultation 🎯</Text>
          <Text style={styles.sub}>Activer/désactiver chaque type</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {/* Présentiel - toujours actif */}
        <View style={[styles.modeCard, { borderLeftColor: "#3B82F6" }]}>
          <Text style={styles.emoji}>🏥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeLabel}>Au cabinet</Text>
            <Text style={styles.modeDesc}>Consultation sur place dans votre cabinet — toujours actif</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: "#10B981" }]}>
            <Text style={styles.statusText}>ACTIVÉ</Text>
          </View>
        </View>

        {/* Téléconsultation */}
        <View style={[styles.modeCard, { borderLeftColor: "#A855F7" }]}>
          <Text style={styles.emoji}>📹</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeLabel}>Téléconsultation</Text>
            <Text style={styles.modeDesc}>Visio sécurisée Agora HD pour les mamans à distance</Text>
          </View>
          <Toggle value={tele} onChange={setTele} color="#A855F7" />
        </View>

        {/* Domicile */}
        <View style={[styles.modeCard, { borderLeftColor: "#F59E0B" }]}>
          <Text style={styles.emoji}>🏠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeLabel}>À domicile</Text>
            <Text style={styles.modeDesc}>Vous vous déplacez chez la patiente. Adresse partagée après paiement.</Text>
          </View>
          <Toggle value={domicile} onChange={setDomicile} color="#F59E0B" />
        </View>

        {domicile && (
          <View style={styles.fraisBox}>
            <Text style={styles.fraisLabel}>Supplément déplacement (F CFA)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="2000"
              placeholderTextColor={COLORS.textMuted}
              value={frais}
              onChangeText={(t) => setFrais(t.replace(/[^0-9]/g, ""))}
            />
            <Text style={styles.fraisHint}>💡 Ce montant sera ajouté au total facturé. La maman le voit avant de payer.</Text>
            <View style={styles.suggRow}>
              {[1000, 2000, 3000, 5000].map((v) => (
                <TouchableOpacity key={v} style={[styles.sugg, parseInt(frais) === v && { backgroundColor: "#F59E0B", borderColor: "#F59E0B" }]} onPress={() => setFrais(String(v))}>
                  <Text style={[styles.suggText, parseInt(frais) === v && { color: "#fff" }]}>{(v / 1000).toFixed(0)}K</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.commBox}>
          <Text style={styles.commTitle}>💰 Commission selon le mode</Text>
          <Text style={styles.commLine}>🏥 Cabinet · 📹 Téléconsult : <Text style={{ fontWeight: "800" }}>5%</Text> Premium / 10% gratuit</Text>
          <Text style={styles.commLine}>🏠 À domicile : <Text style={{ fontWeight: "800" }}>7%</Text> Premium / 12% gratuit (compense la coordination)</Text>
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.saveText}>Enregistrer</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Toggle({ value, onChange, color }: { value: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <TouchableOpacity onPress={() => onChange(!value)} style={[stylesT.toggle, value && { backgroundColor: color }]}>
      <View style={[stylesT.knob, value && stylesT.knobOn]} />
    </TouchableOpacity>
  );
}

const stylesT = StyleSheet.create({
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: "#D1D5DB", justifyContent: "center", padding: 2 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignSelf: "flex-start" },
  knobOn: { alignSelf: "flex-end" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  modeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderLeftWidth: 4, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  emoji: { fontSize: 32 },
  modeLabel: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  modeDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  fraisBox: { backgroundColor: "#FEF3C7", padding: 14, borderRadius: RADIUS.md, marginBottom: 14, borderWidth: 1, borderColor: "#FCD34D" },
  fraisLabel: { fontSize: 13, fontWeight: "800", color: "#92400E", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#FCD34D", padding: 10, borderRadius: 8, fontSize: 15, color: COLORS.textPrimary, backgroundColor: "#fff", marginBottom: 8 },
  fraisHint: { fontSize: 11, color: "#78350F", marginBottom: 10, lineHeight: 15, fontStyle: "italic" },
  suggRow: { flexDirection: "row", gap: 6 },
  sugg: { flex: 1, padding: 8, backgroundColor: "#fff", borderRadius: 6, alignItems: "center", borderWidth: 1, borderColor: "#FCD34D" },
  suggText: { fontSize: 12, fontWeight: "800", color: "#92400E" },
  commBox: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  commTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  commLine: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4, lineHeight: 16 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, ...SHADOW },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
