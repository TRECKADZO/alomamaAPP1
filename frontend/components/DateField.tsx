import { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Props = {
  value: string; // YYYY-MM-DD, HH:mm, or YYYY-MM-DDTHH:mm
  onChange: (iso: string) => void;
  mode?: "date" | "time" | "datetime";
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
  testID?: string;
  label?: string;
};

const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS_FR = ["L", "M", "M", "J", "V", "S", "D"];

const pad = (n: number) => n.toString().padStart(2, "0");

function toDateISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeISO(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toDateTimeISO(d: Date) {
  return `${toDateISO(d)}T${toTimeISO(d)}`;
}

function parse(value: string, mode: string): Date {
  if (!value) return new Date();
  if (mode === "time") {
    const [h, m] = value.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DateField({ value, onChange, mode = "date", minimumDate, maximumDate, placeholder, testID }: Props) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(parse(value, mode));
  const [temp, setTemp] = useState<Date>(parse(value, mode));
  const [timeStr, setTimeStr] = useState<string>(mode === "time" ? (value || "08:00") : toTimeISO(parse(value, mode)));
  const [yearPicker, setYearPicker] = useState(false);

  const displayValue = () => {
    if (!value) return placeholder || (mode === "time" ? "Choisir l'heure" : mode === "datetime" ? "Choisir date et heure" : "Choisir une date");
    if (mode === "time") return value;
    const d = parse(value, mode);
    if (mode === "datetime") {
      return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  };

  const openPicker = () => {
    const v = parse(value, mode);
    setTemp(v);
    setCursor(v);
    setTimeStr(mode === "time" ? (value || toTimeISO(v)) : toTimeISO(v));
    setYearPicker(false);
    setOpen(true);
  };

  const validate = () => {
    if (mode === "time") {
      onChange(timeStr || toTimeISO(temp));
    } else if (mode === "datetime") {
      const [h, m] = (timeStr || "08:00").split(":").map(Number);
      const d = new Date(temp);
      d.setHours(h || 0, m || 0, 0, 0);
      onChange(toDateTimeISO(d));
    } else {
      onChange(toDateISO(temp));
    }
    setOpen(false);
  };

  const iconName: any = mode === "time" ? "time-outline" : "calendar-outline";

  // --- Month grid ---
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const firstDow = (monthStart.getDay() + 6) % 7; // Monday = 0
  const gridDays: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) gridDays.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) gridDays.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (gridDays.length % 7 !== 0) gridDays.push(null);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const start = minimumDate ? minimumDate.getFullYear() : current - 80;
    const end = maximumDate ? maximumDate.getFullYear() : current + 10;
    const arr: number[] = [];
    for (let y = end; y >= start; y--) arr.push(y);
    return arr;
  }, [minimumDate, maximumDate]);

  const isDisabled = (d: Date) => {
    if (minimumDate && d < new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())) return true;
    if (maximumDate && d > new Date(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate())) return true;
    return false;
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} testID={testID || "date-field"} activeOpacity={0.7}>
        <Ionicons name={iconName} size={18} color={COLORS.textMuted} />
        <Text style={[styles.value, !value && { color: COLORS.textMuted }]}>{displayValue()}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.head}>
              <Text style={styles.headTitle}>
                {mode === "time" ? "Choisir l'heure" : mode === "datetime" ? "Date & heure" : "Choisir une date"}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {mode !== "time" && !yearPicker && (
              <>
                <View style={styles.monthRow}>
                  <TouchableOpacity style={styles.navBtn} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                    <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setYearPicker(true)} style={styles.monthLabel}>
                    <Text style={styles.monthText}>{MOIS_FR[cursor.getMonth()]} {cursor.getFullYear()}</Text>
                    <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navBtn} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                    <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.dowRow}>
                  {JOURS_FR.map((j, i) => <Text key={i} style={styles.dow}>{j}</Text>)}
                </View>

                <View style={styles.grid}>
                  {gridDays.map((d, i) => {
                    if (!d) return <View key={i} style={styles.cell} />;
                    const selected = sameDay(d, temp);
                    const today = sameDay(d, new Date());
                    const disabled = isDisabled(d);
                    return (
                      <TouchableOpacity
                        key={i}
                        disabled={disabled}
                        onPress={() => setTemp(d)}
                        style={styles.cell}
                      >
                        <View style={[
                          styles.dayInner,
                          selected && styles.daySelected,
                          today && !selected && styles.dayToday,
                          disabled && { opacity: 0.25 },
                        ]}>
                          <Text style={[styles.dayText, (selected) && { color: "#fff", fontWeight: "800" }, today && !selected && { color: COLORS.primary, fontWeight: "800" }]}>
                            {d.getDate()}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {mode !== "time" && yearPicker && (
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {years.map((y) => (
                  <TouchableOpacity
                    key={y}
                    style={[styles.yearBtn, y === cursor.getFullYear() && styles.yearBtnActive]}
                    onPress={() => {
                      setCursor(new Date(y, cursor.getMonth(), 1));
                      setYearPicker(false);
                    }}
                  >
                    <Text style={[styles.yearText, y === cursor.getFullYear() && { color: "#fff", fontWeight: "800" }]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {(mode === "time" || mode === "datetime") && (
              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={18} color={COLORS.primary} />
                <Text style={styles.timeLabel}>Heure :</Text>
                <TextInput
                  style={styles.timeInput}
                  value={timeStr}
                  onChangeText={(v) => {
                    // Allow only HH:MM format
                    const cleaned = v.replace(/[^0-9:]/g, "").slice(0, 5);
                    setTimeStr(cleaned);
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            )}

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.validateBtn} onPress={validate} testID="date-validate">
                <Text style={styles.validateText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  value: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 380, backgroundColor: COLORS.bgPrimary, borderRadius: 20, padding: SPACING.lg, ...(Platform.OS === "web" ? { boxShadow: "0 10px 40px rgba(0,0,0,0.25)" } as any : {}) },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  navBtn: { padding: 6, borderRadius: 16 },
  monthLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthText: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, textTransform: "capitalize" },
  dowRow: { flexDirection: "row", paddingVertical: 4 },
  dow: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  dayInner: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: "500" },
  daySelected: { backgroundColor: COLORS.primary },
  dayToday: { borderWidth: 2, borderColor: COLORS.primary },
  yearBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, minWidth: 72, alignItems: "center" },
  yearBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  yearText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: "600" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, height: 46 },
  timeLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  timeInput: { flex: 1, fontSize: 16, color: COLORS.textPrimary, fontWeight: "700", textAlign: "center" },
  footer: { flexDirection: "row", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  cancelText: { color: COLORS.textPrimary, fontWeight: "700" },
  validateBtn: { flex: 1.6, paddingVertical: 12, borderRadius: 999, backgroundColor: COLORS.primary, alignItems: "center" },
  validateText: { color: "#fff", fontWeight: "800" },
});
