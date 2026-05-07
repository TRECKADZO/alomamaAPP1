/**
 * Mon espace Centre — Hub central de TOUS les outils du centre de santé.
 * Organisé en catégories thématiques + recherche.
 */
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type Tool = {
  id: string;
  label: string;
  sub: string;
  icon: string;
  color: string;
  path: string;
  keywords?: string[];
};

type Category = {
  key: string;
  label: string;
  emoji: string;
  tools: Tool[];
};

const CATEGORIES: Category[] = [
  {
    key: "reseau",
    label: "Mon réseau",
    emoji: "👥",
    tools: [
      { id: "pros", label: "Mes pros", sub: "Médecins membres", icon: "people", color: "#A855F7", path: "/(tabs)/patients" },
      { id: "patientes", label: "Mes patientes", sub: "Mamans suivies", icon: "heart", color: "#EC4899", path: "/(tabs)/patientes" },
      { id: "membres", label: "Membres", sub: "Gérer le personnel", icon: "person-add", color: "#3B82F6", path: "/centre/membres" },
      { id: "search", label: "Trouver un pro", sub: "Annuaire santé", icon: "search", color: "#6366F1", path: "/search" },
      { id: "centres", label: "Autres centres", sub: "Annuaire PMI/cliniques", icon: "business", color: "#14B8A6", path: "/centres" },
    ],
  },
  {
    key: "agenda",
    label: "Activité & RDV",
    emoji: "📅",
    tools: [
      { id: "calendrier", label: "Calendrier", sub: "Agenda du centre", icon: "calendar", color: "#3B82F6", path: "/centre/calendrier" },
      { id: "tarifs", label: "Tarifs", sub: "Grille des prestations", icon: "pricetag", color: "#10B981", path: "/centre/tarifs", keywords: ["prix", "prestations"] },
      { id: "rdv-nouveau", label: "Nouveau RDV", sub: "Créer manuellement", icon: "add-circle", color: "#10B981", path: "/rdv-nouveau" },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    emoji: "💬",
    tools: [
      { id: "messages", label: "Messagerie", sub: "Pros & patientes", icon: "chatbubbles", color: "#0EA5E9", path: "/(tabs)/messages" },
      { id: "assistant", label: "Assistant IA", sub: "Support intelligent", icon: "sparkles", color: "#F59E0B", path: "/(tabs)/assistant", keywords: ["ai", "ia"] },
      { id: "notifications", label: "Notifications", sub: "Centre des alertes", icon: "notifications", color: "#3B82F6", path: "/notifications" },
    ],
  },
  {
    key: "outils-medicaux",
    label: "Outils médicaux",
    emoji: "🩺",
    tools: [
      { id: "calculs", label: "Boîte à outils", sub: "DPA, poids, IMC, température", icon: "calculator", color: "#6366F1", path: "/outils", keywords: ["dpa", "imc", "calcul"] },
      { id: "documents", label: "Documents", sub: "Gestion documentaire", icon: "folder", color: "#0EA5E9", path: "/documents" },
      { id: "fhir", label: "Interopérabilité (FHIR)", sub: "Export santé HL7", icon: "swap-horizontal", color: "#14B8A6", path: "/fhir", keywords: ["export"] },
    ],
  },
  {
    key: "ressources",
    label: "Ressources",
    emoji: "📚",
    tools: [
      { id: "ressources", label: "Ressources éducatives", sub: "Vidéos, fiches, conseils", icon: "library", color: "#A855F7", path: "/ressources", keywords: ["video", "education"] },
      { id: "glossaire", label: "Glossaire médical", sub: "Définitions claires", icon: "book", color: "#3B82F6", path: "/glossaire" },
      { id: "support", label: "Aide & Support", sub: "FAQ, contact", icon: "headset", color: "#06B6D4", path: "/aide-support" },
    ],
  },
];

export default function MonEspaceCentre() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  const filteredCategories = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return CATEGORIES.map((c) => ({
      ...c,
      tools: c.tools.filter((t) => {
        if (activeCat !== "all" && c.key !== activeCat) return false;
        if (!ql) return true;
        return (
          t.label.toLowerCase().includes(ql) ||
          t.sub.toLowerCase().includes(ql) ||
          t.keywords?.some((k) => k.includes(ql))
        );
      }),
    })).filter((c) => c.tools.length > 0);
  }, [q, activeCat]);

  const totalTools = CATEGORIES.reduce((s, c) => s + c.tools.length, 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#A855F7", "#7C3AED"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="hub-centre-back">
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mon espace Centre</Text>
          <Text style={styles.sub}>{totalTools} outils en un endroit</Text>
        </View>
      </LinearGradient>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un outil..."
          placeholderTextColor={COLORS.textMuted}
          testID="hub-centre-search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")} testID="hub-centre-clear">
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        <Tab label="Tout" emoji="" active={activeCat === "all"} count={totalTools} onPress={() => setActiveCat("all")} />
        {CATEGORIES.map((c) => (
          <Tab
            key={c.key}
            label={c.label}
            emoji={c.emoji}
            active={activeCat === c.key}
            count={c.tools.length}
            onPress={() => setActiveCat(c.key)}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {filteredCategories.length === 0 ? (
          <Text style={styles.empty}>Aucun outil ne correspond à votre recherche.</Text>
        ) : (
          filteredCategories.map((c) => (
            <View key={c.key} style={{ marginBottom: 18 }}>
              <Text style={styles.catTitle}>
                {c.emoji} {c.label} <Text style={styles.catCount}>({c.tools.length})</Text>
              </Text>
              <View style={styles.toolGrid}>
                {c.tools.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.toolCard}
                    onPress={() => router.push(t.path as any)}
                    testID={`tool-${t.id}`}
                  >
                    <View style={[styles.toolIcon, { backgroundColor: `${t.color}1F` }]}>
                      <Ionicons name={t.icon as any} size={22} color={t.color} />
                    </View>
                    <Text style={styles.toolLabel} numberOfLines={2}>{t.label}</Text>
                    <Text style={styles.toolSub} numberOfLines={2}>{t.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tab({ label, emoji, active, count, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {emoji} {label} <Text style={[styles.tabCount, active && { color: "#fff" }]}>{count}</Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: SPACING.lg, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14, padding: 0 },

  tabs: { paddingHorizontal: SPACING.lg, paddingVertical: 12, gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: "#A855F7", borderColor: "#A855F7" },
  tabText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: "#fff" },
  tabCount: { fontSize: 11, color: COLORS.textMuted },

  catTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  catCount: { fontSize: 11, color: COLORS.textMuted, fontWeight: "600" },

  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolCard: { width: "48%", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  toolIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  toolLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
  toolSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 14 },

  empty: { textAlign: "center", color: COLORS.textMuted, padding: 30, fontStyle: "italic" },
});
