import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  const screenHeight = Dimensions.get("window").height;
  const listMaxHeight = Math.max(240, screenHeight * 0.55);

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} testID={testID || "picker-field"}>
        <Text style={[styles.value, !value && { color: COLORS.textMuted }]} numberOfLines={1}>
          {current ? current.label : (placeholder || "Choisir...")}
        </Text>
        <Ionicons name={icon} size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
            style={styles.kav}
          >
            <SafeAreaView edges={["bottom"]} style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{placeholder || "Sélectionner"}</Text>
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery("")}>
                      <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <FlatList
                data={filtered}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.option, value === item.value && styles.optionActive]}
                    onPress={() => { onChange(item.value); setOpen(false); setQuery(""); }}
                  >
                    <Text style={[styles.optionText, value === item.value && { color: "#fff", fontWeight: "800" }]}>{item.label}</Text>
                    {value === item.value && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                )}
                style={{ maxHeight: listMaxHeight }}
                contentContainerStyle={{ paddingBottom: 8 }}
                ListEmptyComponent={<Text style={styles.empty}>Aucun résultat</Text>}
              />
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", flex: 1, minHeight: 44 },
  value: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SPACING.lg, paddingTop: 8, paddingBottom: 4, minHeight: 320, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 8 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  option: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: RADIUS.md, marginBottom: 4 },
  optionActive: { backgroundColor: COLORS.primary },
  optionText: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  empty: { padding: 20, textAlign: "center", color: COLORS.textMuted },
});
