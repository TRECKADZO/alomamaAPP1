import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { COLORS, RADIUS } from "../constants/theme";

type Props = {
  value: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm (if mode="datetime")
  onChange: (iso: string) => void;
  mode?: "date" | "time" | "datetime";
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
  testID?: string;
  label?: string;
};

function toISO(date: Date, mode: string): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (mode === "time") return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (mode === "datetime") return `${y}-${m}-${d}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${y}-${m}-${d}`;
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

export default function DateField({ value, onChange, mode = "date", minimumDate, maximumDate, placeholder, testID }: Props) {
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(parse(value, mode));

  const displayValue = () => {
    if (!value) return placeholder || (mode === "time" ? "--:--" : "Choisir une date");
    if (mode === "time") return value;
    const d = parse(value, mode);
    if (mode === "datetime") {
      return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  };

  const handleChange = (_e: any, selected?: Date) => {
    if (Platform.OS !== "ios") {
      setShow(false);
      if (selected) onChange(toISO(selected, mode));
    } else if (selected) {
      setTempDate(selected);
    }
  };

  const iconName: any = mode === "time" ? "time-outline" : "calendar-outline";

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => { setTempDate(parse(value, mode)); setShow(true); }} testID={testID || "date-field"}>
        <Ionicons name={iconName} size={18} color={COLORS.textMuted} />
        <Text style={[styles.value, !value && { color: COLORS.textMuted }]}>{displayValue()}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {show && Platform.OS !== "ios" && (
        <DateTimePicker
          value={tempDate}
          mode={mode as any}
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={show} transparent animationType="slide">
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <View style={styles.iosHead}>
                <TouchableOpacity onPress={() => setShow(false)}><Text style={styles.iosBtn}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { onChange(toISO(tempDate, mode)); setShow(false); }}>
                  <Text style={[styles.iosBtn, { color: COLORS.primary, fontWeight: "800" }]}>Valider</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode as any}
                display="spinner"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={(_e, d) => d && setTempDate(d)}
              />
            </View>
          </View>
        </Modal>
      )}
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
  iosOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  iosSheet: { backgroundColor: "#fff", paddingBottom: 20 },
  iosHead: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iosBtn: { fontSize: 15, color: COLORS.textSecondary },
});
