import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"];

export default function MonAgenda() {
  const router = useRouter();
  const [rdv, setRdv] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date());

  const load = async () => {
    try {
      const [r, m] = await Promise.all([
        api.get("/rdv").catch(() => ({ data: [] })),
        api.get("/reminders").catch(() => ({ data: [] })),
      ]);
      setRdv(r.data);
      setReminders(m.data);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const events = [
    ...rdv.map((r) => ({ ...r, type: "rdv", date: new Date(r.date), title: r.motif || "RDV", sub: r.pro_name })),
    ...reminders.filter((m) => !m.done).map((m) => ({ ...m, type: "reminder", date: new Date(m.due_at), title: m.title, sub: m.notes })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const month = date.getMonth();
  const year = date.getFullYear();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // L=0
  const days = lastDay.getDate();

  const eventsByDay: Record<number, any[]> = {};
  events.forEach((e) => {
    if (e.date.getMonth() === month && e.date.getFullYear() === year) {
      const d = e.date.getDate();
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push(e);
    }
  });

  const today = new Date();
  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const monthEvents = events.filter((e) => e.date.getMonth() === month && e.date.getFullYear() === year && e.date >= today);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mon agenda</Text>
          <Text style={styles.sub}>Vos RDV et rappels</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Calendar */}
        <View style={styles.calendarCard}>
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => setDate(new Date(year, month - 1, 1))} style={styles.navBtn}><Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
            <Text style={styles.monthLabel}>{MOIS_FR[month]} {year}</Text>
            <TouchableOpacity onPress={() => setDate(new Date(year, month + 1, 1))} style={styles.navBtn}><Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
          </View>
          <View style={styles.weekRow}>
            {JOURS_FR.map((j, i) => <Text key={i} style={styles.weekday}>{j}</Text>)}
          </View>
          <View style={styles.daysGrid}>
            {Array.from({ length: startWeekday }).map((_, i) => <View key={"e" + i} style={styles.dayCell} />)}
            {Array.from({ length: days }).map((_, i) => {
              const d = i + 1;
              const has = eventsByDay[d];
              return (
                <View key={d} style={[styles.dayCell, isToday(d) && styles.dayToday]}>
                  <Text style={[styles.dayText, isToday(d) && { color: "#fff", fontWeight: "800" }]}>{d}</Text>
                  {has && <View style={styles.dot} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* Liste événements à venir */}
        <Text style={styles.sectionTitle}>Événements à venir ({monthEvents.length})</Text>
        {monthEvents.length === 0 ? (
          <Text style={styles.empty}>Aucun événement à venir ce mois-ci</Text>
        ) : (
          monthEvents.map((e: any) => {
            const isRdv = e.type === "rdv";
            return (
              <View key={e.id} style={styles.eventCard}>
                <LinearGradient
                  colors={isRdv ? ["#A855F7", "#6366F1"] : ["#F59E0B", "#EF4444"]}
                  style={styles.eventIcon}
                >
                  <Ionicons name={isRdv ? "medical" : "alarm"} size={18} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                  {e.sub && <Text style={styles.eventSub}>{e.sub}</Text>}
                  <Text style={styles.eventDate}>{e.date.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  calendarCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg, ...SHADOW },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  monthLabel: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, textTransform: "capitalize" },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.bgSecondary, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row", marginBottom: 8 },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "800", color: COLORS.textMuted },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  dayToday: { backgroundColor: COLORS.primary, borderRadius: 999, width: "12%", aspectRatio: 1 },
  dayText: { fontSize: 13, color: COLORS.textPrimary },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.accent, marginTop: 2 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  empty: { color: COLORS.textMuted, fontStyle: "italic", textAlign: "center", paddingVertical: 20 },
  eventCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  eventIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  eventSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  eventDate: { color: COLORS.primary, fontSize: 11, marginTop: 4, fontWeight: "600" },
});
