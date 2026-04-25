import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const DANGER_COLORS: Record<string, string> = {
  high: "#DC2626",
  medium: "#F59E0B",
  low: "#10B981",
};

export default function MaisonSecuriseeScreen() {
  const router = useRouter();
  const [pieces, setPieces] = useState<any[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/maison-securisee").then((r) => r.data.pieces || []),
      api.get("/maison-securisee/state").then((r) => (r.data.checked || []) as string[]).catch(() => []),
    ]).then(([p, c]) => {
      setPieces(p);
      const initial: Record<string, boolean> = {};
      c.forEach((id) => { initial[id] = true; });
      setChecked(initial);
      setLoading(false);
    });
  }, []);

  const toggle = async (id: string) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    setSaving(true);
    try {
      await api.post("/maison-securisee/check", { checked: Object.keys(next).filter((k) => next[k]) });
    } catch (e) { /* silent */ } finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const piece = pieces[activeIdx] || {};
  const items = piece.items || [];
  const totalAll = pieces.reduce((s, p) => s + p.items.length, 0);
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const pct = totalAll ? Math.round((checkedCount / totalAll) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#0EA5E9", "#10B981"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🏠 Maison sécurisée</Text>
          <Text style={styles.sub}>Checklist par pièce — {pct}% sécurisé</Text>
        </View>
      </LinearGradient>

      <View style={styles.progressWrap}>
        <View style={[styles.progressBar, { width: `${pct}%`, backgroundColor: pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#DC2626" }]} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {pieces.map((p, i) => (
          <TouchableOpacity key={i} onPress={() => setActiveIdx(i)} style={[styles.tab, i === activeIdx && { backgroundColor: p.color, borderColor: p.color }]}>
            <Ionicons name={p.icon} size={14} color={i === activeIdx ? "#fff" : p.color} />
            <Text style={[styles.tabText, i === activeIdx && { color: "#fff" }]}>{p.piece}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 60 }}>
        <Text style={styles.intro}>
          Cochez ce qui est déjà sécurisé chez vous. Les éléments en <Text style={{ color: "#DC2626", fontWeight: "800" }}>rouge</Text> sont des dangers majeurs.
        </Text>
        {items.map((item: any) => {
          const ok = checked[item.id];
          const c = DANGER_COLORS[item.danger] || "#6B7280";
          return (
            <TouchableOpacity key={item.id} onPress={() => toggle(item.id)} style={styles.itemRow} testID={`check-${item.id}`}>
              <View style={[styles.checkbox, ok && { backgroundColor: piece.color || COLORS.primary, borderColor: piece.color || COLORS.primary }]}>
                {ok && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={[styles.dangerDot, { backgroundColor: c }]} />
              <Text style={[styles.itemText, ok && { color: COLORS.textMuted, textDecorationLine: "line-through" }]}>{item.text}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  progressWrap: { height: 6, marginHorizontal: SPACING.xl, marginTop: 12, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 3 },
  tabs: { padding: SPACING.xl, gap: 6, paddingBottom: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabText: { fontWeight: "700", fontSize: 12, color: COLORS.textPrimary },
  intro: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 12, lineHeight: 16 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  dangerDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  itemText: { flex: 1, color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 },
});
