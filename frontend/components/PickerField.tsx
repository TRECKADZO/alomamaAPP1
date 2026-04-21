import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  placeholder?: string;
  searchable?: boolean;
  testID?: string;
  icon?: any;
};

export default function PickerField({ value, onChange, options, placeholder, searchable, testID, icon = "chevron-down" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedOptions = options.map((o: any) => typeof o === "string" ? { value: o, label: o } : o);
  const filtered = normalizedOptions.filter((o) =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  );
  const current = normalizedOptions.find((o) => o.value === value);

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} testID={testID || "picker-field"}>
        <Text style={[styles.value, !value && { color: COLORS.textMuted }]} numberOfLines={1}>
          {current ? current.label : (placeholder || "Choisir...")}
        </Text>
        <Ionicons name={icon} size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{placeholder || "Sélectionner"}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={COLORS.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher..."
                  placeholderTextColor={COLORS.textMuted}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
            )}

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, value === item.value && styles.optionActive]}
                  onPress={() => { onChange(item.value); setOpen(false); setQuery(""); }}
                >
                  <Text style={[styles.optionText, value === item.value && { color: "#fff", fontWeight: "800" }]}>{item.label}</Text>
                  {value === item.value && <Ionicons name="checkmark" size={18} color="#fff" />}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
              ListEmptyComponent={<Text style={styles.empty}>Aucun résultat</Text>}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", flex: 1, minHeight: 44 },
  value: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, maxHeight: "80%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 40, marginBottom: 8 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  option: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: RADIUS.md, marginBottom: 4 },
  optionActive: { backgroundColor: COLORS.primary },
  optionText: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  empty: { padding: 20, textAlign: "center", color: COLORS.textMuted },
});
