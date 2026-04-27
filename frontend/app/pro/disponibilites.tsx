import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import DateField from "../../components/DateField";
import { TYPES_CONSULTATION } from "../../lib/data";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const DUREES = [15, 30, 45, 60, 90, 120];

type Slot = {
  jour: string;
  heure_debut: string;
  heure_fin: string;
  actif: boolean;
  type_id: string;
  duree_minutes: number;
};

export default function GestionDisponibilites() {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultDuree, setDefaultDuree] = useState(30); // hérité legacy, utilisé comme fallback

  const load = async () => {
    try {
      const { data } = await api.get("/pro/disponibilites");
      const dureeGlobal = data.duree_consultation || 30;
      setDefaultDuree(dureeGlobal);
      const raw = data.slots || [];
      // Migration douce : éclate les anciens slots multi-types en plusieurs slots mono-type
      const migrated: Slot[] = [];
      for (const s of raw) {
        if (s.type_id && s.duree_minutes) {
          // Déjà au nouveau format
          migrated.push({
            jour: s.jour,
            heure_debut: s.heure_debut,
            heure_fin: s.heure_fin,
            actif: s.actif !== false,
            type_id: s.type_id,
            duree_minutes: s.duree_minutes,
          });
        } else if (s.types && s.types.length) {
          // Legacy multi-types : on prend le premier type, durée = globale
          migrated.push({
            jour: s.jour,
            heure_debut: s.heure_debut,
            heure_fin: s.heure_fin,
            actif: s.actif !== false,
            type_id: s.types[0],
            duree_minutes: dureeGlobal,
          });
        } else {
          // Très ancien : pas de type → "generale"
          migrated.push({
            jour: s.jour,
            heure_debut: s.heure_debut,
            heure_fin: s.heure_fin,
            actif: s.actif !== false,
            type_id: "generale",
            duree_minutes: dureeGlobal,
          });
        }
      }
      setSlots(migrated);
    } catch {}
    finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const addSlot = (jour: string) => {
    setSlots((prev) => [...prev, {
      jour,
      heure_debut: "08:00",
      heure_fin: "12:00",
      actif: true,
      type_id: "generale",
      duree_minutes: defaultDuree,
    }]);
  };
  const updateSlot = (idx: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };
  const duplicateSlot = (idx: number) => {
    setSlots((prev) => {
      const orig = prev[idx];
      if (!orig) return prev;
      const copy: Slot = { ...orig };
      const out = [...prev];
      out.splice(idx + 1, 0, copy);
      return out;
    });
  };

  const save = async () => {
    try {
      await api.put("/pro/disponibilites", {
        slots: slots.map((s) => ({
          jour: s.jour,
          heure_debut: s.heure_debut,
          heure_fin: s.heure_fin,
          actif: s.actif,
          type_id: s.type_id,
          duree_minutes: s.duree_minutes,
          types: [s.type_id], // rétro-compat avec ancien front
        })),
        duree_consultation: defaultDuree,
      });
      Alert.alert("Succès", "Disponibilités enregistrées");
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const byJour: Record<string, (Slot & { _idx: number })[]> = {};
  slots.forEach((s, i) => {
    if (!byJour[s.jour]) byJour[s.jour] = [];
    byJour[s.jour].push({ ...s, _idx: i });
  });

  const getType = (id: string) => TYPES_CONSULTATION.find((t) => t.id === id) || TYPES_CONSULTATION.find((t) => t.id === "generale")!;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes disponibilités</Text>
          <Text style={styles.sub}>Définissez vos créneaux par type de consultation et durée</Text>
        </View>
        <TouchableOpacity onPress={save} style={styles.saveBtn}>
          <Ionicons name="checkmark" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color="#0E7490" />
          <Text style={styles.infoText}>
            Chaque créneau a son <Text style={{ fontWeight: "800" }}>type de consultation</Text> et sa <Text style={{ fontWeight: "800" }}>durée propre</Text>. Vous pouvez créer plusieurs créneaux par jour (ex: matin échographies 45 min, après-midi consultations 30 min).
          </Text>
        </View>

        {JOURS.map((jour) => {
          const jourSlots = byJour[jour] || [];
          return (
            <View key={jour} style={styles.dayCard}>
              <View style={styles.dayHead}>
                <Text style={styles.dayLabel}>{jour.charAt(0).toUpperCase() + jour.slice(1)}</Text>
                <TouchableOpacity onPress={() => addSlot(jour)} style={styles.addSlotBtn}>
                  <Ionicons name="add" size={16} color="#0E7490" />
                  <Text style={styles.addSlotText}>Ajouter</Text>
                </TouchableOpacity>
              </View>

              {jourSlots.length === 0 ? (
                <Text style={styles.emptyDay}>Repos</Text>
              ) : (
                jourSlots.map((s) => {
                  const typeData = getType(s.type_id);
                  return (
                    <View key={s._idx} style={[styles.slotCard, { borderLeftWidth: 4, borderLeftColor: typeData.color }]}>
                      {/* Heure début → fin + toggle/actions */}
                      <View style={styles.slotRow}>
                        <View style={{ flex: 1 }}>
                          <DateField value={s.heure_debut} mode="time" onChange={(v) => updateSlot(s._idx, { heure_debut: v })} />
                        </View>
                        <Text style={{ color: COLORS.textSecondary, fontWeight: "700" }}>→</Text>
                        <View style={{ flex: 1 }}>
                          <DateField value={s.heure_fin} mode="time" onChange={(v) => updateSlot(s._idx, { heure_fin: v })} />
                        </View>
                        <TouchableOpacity onPress={() => updateSlot(s._idx, { actif: !s.actif })} style={styles.toggleWrap}>
                          <View style={[styles.toggle, s.actif && { backgroundColor: typeData.color }]}>
                            <View style={[styles.toggleDot, s.actif && { transform: [{ translateX: 14 }] }]} />
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Type de consultation (chips, sélection unique) */}
                      <Text style={styles.fieldLabel}>Type de consultation</Text>
                      <View style={styles.typesRow}>
                        {TYPES_CONSULTATION.map((t) => {
                          const active = s.type_id === t.id;
                          return (
                            <TouchableOpacity
                              key={t.id}
                              onPress={() => updateSlot(s._idx, { type_id: t.id })}
                              style={[styles.typePill, active && { backgroundColor: t.color, borderColor: t.color }]}
                            >
                              <Text style={[styles.typePillText, active && { color: "#fff" }]}>{t.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Durée par RDV */}
                      <Text style={styles.fieldLabel}>Durée par RDV</Text>
                      <View style={styles.dureesRow}>
                        {DUREES.map((d) => {
                          const active = s.duree_minutes === d;
                          return (
                            <TouchableOpacity
                              key={d}
                              onPress={() => updateSlot(s._idx, { duree_minutes: d })}
                              style={[styles.durPill, active && { backgroundColor: typeData.color, borderColor: typeData.color }]}
                            >
                              <Text style={[styles.durPillText, active && { color: "#fff" }]}>{d}'</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Actions */}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity onPress={() => duplicateSlot(s._idx)} style={styles.actionBtn}>
                          <Ionicons name="copy-outline" size={14} color={COLORS.textSecondary} />
                          <Text style={styles.actionText}>Dupliquer</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeSlot(s._idx)} style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}>
                          <Ionicons name="trash-outline" size={14} color="#DC2626" />
                          <Text style={[styles.actionText, { color: "#DC2626" }]}>Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        <TouchableOpacity onPress={save} style={{ marginTop: 14 }}>
          <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btnBig}>
            <Ionicons name="save-outline" size={20} color="#fff" />
            <Text style={styles.btnBigText}>Enregistrer mes disponibilités</Text>
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

  infoCard: { flexDirection: "row", gap: 8, backgroundColor: "#CFFAFE", padding: 12, borderRadius: RADIUS.md, marginBottom: 12, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, color: "#0E7490", lineHeight: 17 },

  dayCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, ...SHADOW },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  dayLabel: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15, textTransform: "capitalize" },
  addSlotBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#CFFAFE", paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  addSlotText: { color: "#0E7490", fontWeight: "800", fontSize: 12 },
  emptyDay: { fontStyle: "italic", color: COLORS.textMuted, textAlign: "center", paddingVertical: 10 },

  slotCard: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, marginTop: 10, paddingLeft: 10, paddingRight: 4, paddingBottom: 8, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md, marginBottom: 6 },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  toggleWrap: { padding: 4 },
  toggle: { width: 36, height: 22, borderRadius: 11, backgroundColor: COLORS.border, padding: 3 },
  toggleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" },

  fieldLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "800", marginTop: 10, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  typesRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  typePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  typePillText: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },

  dureesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  durPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, minWidth: 50, alignItems: "center" },
  durPillText: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },

  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },

  btnBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: RADIUS.pill },
  btnBigText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
