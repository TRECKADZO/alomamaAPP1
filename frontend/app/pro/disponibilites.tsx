import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export default function GestionDisponibilites() {
  const router = useRouter();
  const [slots, setSlots] = useState<any[]>([]);
  const [duree, setDuree] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/pro/disponibilites");
      setSlots(data.slots || []);
      setDuree(data.duree_consultation || 30);
    } catch {}
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const addSlot = (jour: string) => {
    setSlots((prev) => [...prev, { jour, heure_debut: "08:00", heure_fin: "12:00", actif: true }]);
  };
  const updateSlot = (idx: number, patch: any) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    try {
      await api.put("/pro/disponibilites", { slots, duree_consultation: duree });
      Alert.alert("Succès", "Disponibilités enregistrées");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const byJour: Record<string, any[]> = {};
  slots.forEach((s, i) => {
    if (!byJour[s.jour]) byJour[s.jour] = [];
    byJour[s.jour].push({ ...s, _idx: i });
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes disponibilités</Text>
          <Text style={styles.sub}>Créneaux où les patientes peuvent réserver</Text>
        </View>
        <TouchableOpacity onPress={save} style={styles.saveBtn}>
          <Ionicons name="checkmark" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <View style={styles.dureeCard}>
          <Text style={styles.dureeLabel}>Durée d'une consultation</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[15, 30, 45, 60].map((d) => (
              <TouchableOpacity key={d} onPress={() => setDuree(d)} style={[styles.durPill, duree === d && { backgroundColor: "#2DD4BF", borderColor: "#2DD4BF" }]}>
                <Text style={[styles.durPillText, duree === d && { color: "#fff" }]}>{d} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {JOURS.map((jour) => {
          const jourSlots = byJour[jour] || [];
          return (
            <View key={jour} style={styles.dayCard}>
              <View style={styles.dayHead}>
                <Text style={styles.dayLabel}>{jour.charAt(0).toUpperCase() + jour.slice(1)}</Text>
                <TouchableOpacity onPress={() => addSlot(jour)} style={styles.addSlotBtn}>
                  <Ionicons name="add" size={16} color="#2DD4BF" />
                  <Text style={styles.addSlotText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
              {jourSlots.length === 0 ? (
                <Text style={styles.emptyDay}>Repos</Text>
              ) : (
                jourSlots.map((s) => (
                  <View key={s._idx} style={styles.slotRow}>
                    <TextInput style={styles.timeInput} value={s.heure_debut} onChangeText={(v) => updateSlot(s._idx, { heure_debut: v })} placeholder="08:00" placeholderTextColor={COLORS.textMuted} />
                    <Text style={{ color: COLORS.textSecondary }}>→</Text>
                    <TextInput style={styles.timeInput} value={s.heure_fin} onChangeText={(v) => updateSlot(s._idx, { heure_fin: v })} placeholder="12:00" placeholderTextColor={COLORS.textMuted} />
                    <TouchableOpacity onPress={() => updateSlot(s._idx, { actif: !s.actif })} style={styles.toggleWrap}>
                      <View style={[styles.toggle, s.actif && { backgroundColor: "#2DD4BF" }]}>
                        <View style={[styles.toggleDot, s.actif && { transform: [{ translateX: 14 }] }]} />
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSlot(s._idx)}><Ionicons name="trash-outline" size={18} color={COLORS.error} /></TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          );
        })}

        <TouchableOpacity onPress={save} style={{ marginTop: 14 }}>
          <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btnBig}>
            <Ionicons name="save-outline" size={20} color="#fff" />
            <Text style={styles.btnBigText}>Enregistrer les disponibilités</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  saveBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2DD4BF", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  dureeCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, ...SHADOW },
  dureeLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 10 },
  durPill: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center" },
  durPillText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  dayCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, ...SHADOW },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  dayLabel: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, textTransform: "capitalize" },
  addSlotBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#CFFAFE", paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  addSlotText: { color: "#0E7490", fontWeight: "800", fontSize: 12 },
  emptyDay: { fontStyle: "italic", color: COLORS.textMuted, textAlign: "center", paddingVertical: 10 },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  timeInput: { flex: 1, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md, padding: 10, color: COLORS.textPrimary, fontWeight: "700", textAlign: "center" },
  toggleWrap: { padding: 4 },
  toggle: { width: 36, height: 22, borderRadius: 11, backgroundColor: COLORS.border, padding: 3 },
  toggleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" },
  btnBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: RADIUS.pill },
  btnBigText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
