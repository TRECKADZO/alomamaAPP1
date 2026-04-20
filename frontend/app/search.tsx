import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Search() {
  const router = useRouter();
  const [tab, setTab] = useState<"pros" | "community">("pros");
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const url = tab === "pros" ? `/search/pros?q=${encodeURIComponent(q)}&specialite=${encodeURIComponent(spec)}` : `/search/community?q=${encodeURIComponent(q)}`;
      const { data } = await api.get(url);
      setResults(data);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Recherche</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "pros" && styles.tabActive]} onPress={() => { setTab("pros"); setResults([]); }}>
          <Text style={[styles.tabText, tab === "pros" && styles.tabTextActive]}>🩺 Professionnels</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "community" && styles.tabActive]} onPress={() => { setTab("community"); setResults([]); }}>
          <Text style={[styles.tabText, tab === "community" && styles.tabTextActive]}>💬 Communauté</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            placeholder={tab === "pros" ? "Nom du pro..." : "Mot-clé..."}
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={run}
            returnKeyType="search"
            testID="search-input"
          />
        </View>
        {tab === "pros" && (
          <View style={styles.inputWrap}>
            <Ionicons name="briefcase" size={18} color={COLORS.textMuted} />
            <TextInput style={styles.input} value={spec} onChangeText={setSpec} placeholder="Spécialité (ex: Pédiatre)" placeholderTextColor={COLORS.textMuted} testID="spec-input" />
          </View>
        )}
        <TouchableOpacity style={styles.btnSearch} onPress={run} testID="run-search-btn">
          <Text style={styles.btnSearchText}>Rechercher</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0 }}
          renderItem={({ item }) => tab === "pros" ? (
            <TouchableOpacity style={styles.resCard} onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(item.name)}`)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resName}>{item.name}</Text>
                <Text style={styles.resMeta}>{item.specialite}</Text>
              </View>
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.resCard}>
              <View style={[styles.avatar, { backgroundColor: COLORS.secondary }]}><Text style={styles.avatarText}>{item.user_name?.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resName}>{item.title}</Text>
                <Text style={styles.resMeta} numberOfLines={2}>{item.content}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{loading ? "" : "Aucun résultat — lancez une recherche"}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: SPACING.xl },
  title: { flex: 1, fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: SPACING.xl, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  searchBox: { paddingHorizontal: SPACING.xl, gap: 8, marginBottom: 14 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 14 },
  btnSearch: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.pill, alignItems: "center" },
  btnSearchText: { color: "#fff", fontWeight: "700" },
  resCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  resName: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  resMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: 30, fontStyle: "italic" },
});
