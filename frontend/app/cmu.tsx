import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";
import DateField from "../components/DateField";

export default function CMU() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statut, setStatut] = useState("absent");
  const [form, setForm] = useState({
    numero: "",
    nom_complet: "",
    date_delivrance: "",
    date_validite: "",
    beneficiaires: [] as any[],
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const { data } = await api.get("/cmu/me");
      setForm({
        numero: data.cmu?.numero || "",
        nom_complet: data.cmu?.nom_complet || "",
        date_delivrance: data.cmu?.date_delivrance || "",
        date_validite: data.cmu?.date_validite || "",
        beneficiaires: data.cmu?.beneficiaires || [],
      });
      setStatut(data.statut);
    } catch (e) {}
    finally { setLoading(false); }
  };

  const save = async () => {
    const n = (form.numero || "").replace(/\s/g, "");
    if (!/^\d{10}$|^\d{12}$/.test(n)) {
      return Alert.alert("Numéro invalide", "Le numéro CMU doit contenir 10 ou 12 chiffres.");
    }
    if (!form.nom_complet.trim()) {
      return Alert.alert("Nom requis", "Veuillez saisir le nom exact tel qu'inscrit sur la carte.");
    }
    setSaving(true);
    try {
      const { data } = await api.post("/cmu/me", {
        numero: n,
        nom_complet: form.nom_complet.trim(),
        date_delivrance: form.date_delivrance || undefined,
        date_validite: form.date_validite || undefined,
        beneficiaires: form.beneficiaires,
      });
      setStatut(data.statut);
      Alert.alert("CMU enregistrée ✅", "Vos informations CMU ont été sauvegardées. Les pros acceptant la CMU verront votre couverture lors de la prise de RDV.");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setSaving(false); }
  };

  const addBen = () => setForm({ ...form, beneficiaires: [...form.beneficiaires, { nom: "", numero_cmu: "", relation: "enfant" }] });
  const removeBen = (i: number) => setForm({ ...form, beneficiaires: form.beneficiaires.filter((_, idx) => idx !== i) });
  const updateBen = (i: number, k: string, v: string) => {
    const list = [...form.beneficiaires];
    list[i] = { ...list[i], [k]: v };
    setForm({ ...form, beneficiaires: list });
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const statutColor = statut === "actif" ? "#059669" : statut === "expire" ? "#DC2626" : statut === "non_verifie" ? "#F59E0B" : COLORS.textMuted;
  const statutLabel = { actif: "✓ Actif", expire: "⚠ Expiré", non_verifie: "⚠ Non vérifiée", absent: "Non renseignée" }[statut] || "—";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Ma CMU</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <LinearGradient colors={["#16A34A", "#15803D"]} style={styles.hero}>
          <Ionicons name="shield-checkmark" size={34} color="#fff" />
          <Text style={styles.heroTitle}>Couverture Maladie Universelle</Text>
          <Text style={styles.heroSub}>Bénéficiez de 70% (ou 100% pour le prénatal) de prise en charge sur vos consultations.</Text>
          <View style={[styles.statutPill, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
            <Text style={styles.statutText}>{statutLabel}</Text>
          </View>
        </LinearGradient>

        <Text style={styles.label}>Numéro CMU *</Text>
        <TextInput
          style={styles.input}
          value={form.numero}
          onChangeText={(v) => setForm({ ...form, numero: v.replace(/\D/g, "").slice(0, 12) })}
          placeholder="10 ou 12 chiffres"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="numeric"
          maxLength={12}
          testID="cmu-numero"
        />

        <Text style={styles.label}>Nom complet *</Text>
        <TextInput
          style={styles.input}
          value={form.nom_complet}
          onChangeText={(v) => setForm({ ...form, nom_complet: v })}
          placeholder="Nom tel qu'inscrit sur la carte"
          placeholderTextColor={COLORS.textMuted}
          testID="cmu-nom"
        />

        <Text style={styles.label}>Date de délivrance</Text>
        <DateField
          value={form.date_delivrance}
          onChange={(v) => setForm({ ...form, date_delivrance: v })}
          placeholder="Choisir la date"
          maximumDate={new Date()}
        />

        <Text style={styles.label}>Date de validité</Text>
        <DateField
          value={form.date_validite}
          onChange={(v) => setForm({ ...form, date_validite: v })}
          placeholder="Choisir la date de validité"
        />

        {/* Bénéficiaires */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
          <Text style={styles.sectionTitle}>Bénéficiaires rattachés</Text>
          <TouchableOpacity onPress={addBen} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {form.beneficiaires.length === 0 && (
          <Text style={styles.empty}>Aucun bénéficiaire. Ajoutez vos enfants ou conjoint·e.</Text>
        )}
        {form.beneficiaires.map((b, i) => (
          <View key={i} style={styles.benCard}>
            <TextInput style={styles.benInput} value={b.nom} onChangeText={(v) => updateBen(i, "nom", v)} placeholder="Nom" placeholderTextColor={COLORS.textMuted} />
            <TextInput style={styles.benInput} value={b.numero_cmu} onChangeText={(v) => updateBen(i, "numero_cmu", v.replace(/\D/g, ""))} placeholder="Numéro CMU" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
            <View style={styles.relRow}>
              {["enfant", "conjoint", "autre"].map((r) => (
                <TouchableOpacity key={r} style={[styles.relBtn, b.relation === r && styles.relBtnActive]} onPress={() => updateBen(i, "relation", r)}>
                  <Text style={[styles.relText, b.relation === r && { color: "#fff" }]}>{r}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => removeBen(i)} style={styles.removeBen}>
                <Ionicons name="trash-outline" size={14} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={COLORS.textSecondary} />
          <Text style={styles.infoText}>
            Les numéros CMU ne sont pas vérifiés automatiquement (l'État ne propose pas d'API publique).
            Les professionnels peuvent vous demander votre carte physique au rendez-vous.
          </Text>
        </View>

        <TouchableOpacity style={styles.save} onPress={save} disabled={saving} testID="cmu-save">
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.saveText}>Enregistrer ma CMU</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl, paddingBottom: 0 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },

  hero: { padding: 20, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 20, gap: 6 },
  heroTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 8, textAlign: "center" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, textAlign: "center", lineHeight: 18 },
  statutPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, marginTop: 10 },
  statutText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: COLORS.textPrimary, backgroundColor: COLORS.surface },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  empty: { color: COLORS.textMuted, fontSize: 12, marginTop: 8, fontStyle: "italic" },

  benCard: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 8, gap: 6 },
  benInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: 10, fontSize: 13, color: COLORS.textPrimary },
  relRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  relBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  relBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  relText: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },
  removeBen: { marginLeft: "auto", padding: 6 },

  infoBox: { flexDirection: "row", gap: 6, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 18 },
  infoText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },

  save: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 999, marginTop: 24 },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
