import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function CentreTarifs() {
  const router = useRouter();
  const [tarifs, setTarifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/centre/tarifs");
      setTarifs(data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const add = () => {
    setTarifs((prev) => [...prev, { acte: "", prix_fcfa: 0, description: "" }]);
  };
  const update = (idx: number, patch: any) => {
    setTarifs((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  const remove = (idx: number) => {
    setTarifs((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    const valid = tarifs.filter((t) => t.acte && t.prix_fcfa > 0);
    try {
      await api.put("/centre/tarifs", valid);
      Alert.alert("Succès", "Tarifs enregistrés");
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Grille tarifaire</Text>
          <Text style={styles.sub}>Vos tarifs publics (en FCFA)</Text>
        </View>
        <TouchableOpacity onPress={save} style={styles.saveBtn}><Ionicons name="checkmark" size={22} color="#fff" /></TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        {tarifs.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun tarif défini</Text>
            <Text style={styles.emptyText}>Ajoutez vos actes et leurs prix.</Text>
          </View>
        )}
        {tarifs.map((t, idx) => (
          <View key={idx} style={styles.tarifCard}>
            <View style={styles.tarifRow}>
              <TextInput style={[styles.input, { flex: 2 }]} value={t.acte} onChangeText={(v) => update(idx, { acte: v })} placeholder="Nom de l'acte" placeholderTextColor={COLORS.textMuted} />
              <TextInput style={[styles.input, { flex: 1 }]} value={String(t.prix_fcfa || "")} onChangeText={(v) => update(idx, { prix_fcfa: parseInt(v) || 0 })} placeholder="Prix" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" />
              <TouchableOpacity onPress={() => remove(idx)}><Ionicons name="trash-outline" size={20} color={COLORS.error} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { marginTop: 8 }]} value={t.description} onChangeText={(v) => update(idx, { description: v })} placeholder="Description (optionnel)" placeholderTextColor={COLORS.textMuted} />
          </View>
        ))}

        <TouchableOpacity onPress={add} style={styles.addBtn}>
          <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.addBtnGrad}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Ajouter un tarif</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={save}>
          <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.btnBig}>
            <Ionicons name="save-outline" size={20} color="#fff" />
            <Text style={styles.btnBigText}>Enregistrer</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  saveBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4 },
  tarifCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  tarifRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md, padding: 10, color: COLORS.textPrimary, fontSize: 13 },
  addBtn: { marginTop: 10 },
  addBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.pill },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  footer: { position: "absolute", bottom: 16, left: 16, right: 16 },
  btnBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: RADIUS.pill, ...SHADOW },
  btnBigText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
