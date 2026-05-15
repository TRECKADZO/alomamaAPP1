import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Trousseau() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const r = await api.get("/grossesse-plus/trousseau"); setItems(r.data.items || []); } catch {} finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  const toggle = async (id: string) => {
    const next = items.map(it => it.id === id ? { ...it, done: !it.done } : it);
    setItems(next);
    try {
      setBusy(true);
      await api.patch("/grossesse-plus/trousseau", { items: next });
    } catch {} finally { setBusy(false); }
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const grouped: Record<string, any[]> = {};
  items.forEach(it => { (grouped[it.cat] = grouped[it.cat] || []).push(it); });
  const total = items.length;
  const done = items.filter(i => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <View style={s.summaryCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.summaryTitle}>Trousseau maternité</Text>
            <Text style={s.summarySub}>{done} / {total} éléments préparés</Text>
          </View>
          <View style={s.pctRing}>
            <Text style={s.pctVal}>{pct}%</Text>
          </View>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>

        {Object.entries(grouped).map(([cat, list]) => (
          <View key={cat} style={{ marginTop: 18 }}>
            <Text style={s.cat}>{cat}</Text>
            {list.map(it => (
              <TouchableOpacity key={it.id} style={s.row} onPress={() => toggle(it.id)}>
                <View style={[s.box, it.done && s.boxOn]}>
                  {it.done && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={[s.label, it.done && s.labelOn]}>{it.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={s.advice}>
          <Ionicons name="information-circle" size={18} color={COLORS.primary} />
          <Text style={s.adviceTxt}>Pensez à préparer votre trousseau autour de la semaine 34 pour être tranquille.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  summaryCard: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  summaryTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 16 },
  summarySub: { color: COLORS.textSecondary, marginTop: 4 },
  pctRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: COLORS.primary, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryLight },
  pctVal: { color: COLORS.primary, fontWeight: "800", fontSize: 16 },
  progressBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.primary },
  cat: { fontWeight: "800", color: COLORS.primary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  label: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  labelOn: { color: COLORS.textMuted, textDecorationLine: "line-through" },
  advice: { flexDirection: "row", gap: 10, padding: 14, marginTop: 20, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight },
  adviceTxt: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
});
