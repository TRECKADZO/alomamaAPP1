/**
 * Mon espace Pro — Hub central de TOUS les outils du professionnel de santé.
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

// ============================================================================
// CATÉGORIES — TOUS LES OUTILS PRO
// ============================================================================
const CATEGORIES: Category[] = [
  {
    key: "patientes",
    label: "Patientes & RDV",
    emoji: "👩",
    tools: [
      { id: "patientes", label: "Mes patientes", sub: "Liste & dossiers", icon: "people", color: "#2DD4BF", path: "/(tabs)/patients" },
      { id: "rdv", label: "Rendez-vous", sub: "Calendrier consultations", icon: "calendar", color: "#A855F7", path: "/(tabs)/rdv" },
      { id: "agenda-pro", label: "Disponibilités", sub: "Mes créneaux", icon: "time", color: "#06B6D4", path: "/pro/disponibilites" },
      { id: "rdv-nouveau", label: "Nouveau RDV", sub: "Créer manuellement", icon: "add-circle", color: "#10B981", path: "/rdv-nouveau" },
      { id: "consulter", label: "Consulter patient", sub: "Démarrer consultation", icon: "stethoscope", color: "#3B82F6", path: "/pro/consulter-patient", keywords: ["consultation"] },
      { id: "dossier-patient", label: "Dossier patient", sub: "Accès dossier médical", icon: "document-text", color: "#EF4444", path: "/pro/dossier-patient" },
      { id: "teleconsult", label: "Téléconsultation", sub: "Visio à distance", icon: "videocam", color: "#EC4899", path: "/pro/teleconsultation" },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    emoji: "💬",
    tools: [
      { id: "messages", label: "Messagerie", sub: "Discuter avec patientes", icon: "chatbubbles", color: "#3B82F6", path: "/(tabs)/messages" },
      { id: "rappels", label: "Rappels patients", sub: "Envoyer des rappels", icon: "alarm", color: "#F59E0B", path: "/pro/rappels" },
      { id: "notes-ecrites", label: "Notes écrites", sub: "Mes notes consultations", icon: "reader", color: "#06B6D4", path: "/pro/mes-notes-ecrites" },
      { id: "notifications", label: "Notifications", sub: "Centre des alertes", icon: "notifications", color: "#0EA5E9", path: "/notifications" },
    ],
  },
  {
    key: "outils-medicaux",
    label: "Outils médicaux",
    emoji: "🩺",
    tools: [
      { id: "ia", label: "Assistant IA Pro", sub: "Aide diagnostique IA", icon: "sparkles", color: "#A855F7", path: "/pro/ia", keywords: ["intelligence", "ai"] },
      { id: "calculs", label: "Boîte à outils", sub: "DPA, poids, IMC, température", icon: "calculator", color: "#6366F1", path: "/outils", keywords: ["dpa", "imc", "calcul"] },
      { id: "tele-echo", label: "Télé-échographie", sub: "Rapport structuré", icon: "scan", color: "#8B5CF6", path: "/tele-echo" },
      { id: "fhir", label: "Interopérabilité (FHIR)", sub: "Export santé HL7", icon: "swap-horizontal", color: "#14B8A6", path: "/fhir", keywords: ["export"] },
      { id: "documents", label: "Documents", sub: "Ordonnances, analyses", icon: "folder", color: "#0EA5E9", path: "/documents" },
    ],
  },
  {
    key: "finances",
    label: "Activité & Revenus",
    emoji: "💰",
    tools: [
      { id: "prestations", label: "Mes prestations", sub: "Services et tarifs", icon: "pricetag", color: "#10B981", path: "/pro/prestations" },
      { id: "revenus", label: "Revenus", sub: "Statistiques cabinet", icon: "trending-up", color: "#10B981", path: "/pro/revenus" },
      { id: "revenus-mode", label: "Revenus par mode", sub: "Tele / Cabinet / Domicile", icon: "stats-chart", color: "#10B981", path: "/pro/revenus-par-mode", keywords: ["domicile", "stats"] },
      { id: "comptabilite", label: "Comptabilité 💎", sub: "Export CSV mensuel (Premium)", icon: "document-attach", color: "#0EA5E9", path: "/pro/comptabilite", keywords: ["export", "csv", "comptable"] },
      { id: "retraits", label: "Retraits Mobile Money", sub: "Toucher mes paiements", icon: "card", color: "#F59E0B", path: "/pro/retraits", keywords: ["paiement", "mobile money"] },
      { id: "cmu-pro", label: "CMU Pro", sub: "Validation CMU patients", icon: "shield-checkmark", color: "#16A34A", path: "/pro/cmu" },
    ],
  },
  {
    key: "ressources",
    label: "Ressources & Réseau",
    emoji: "📚",
    tools: [
      { id: "ressources", label: "Ressources éducatives", sub: "Vidéos, fiches, conseils", icon: "library", color: "#A855F7", path: "/ressources", keywords: ["video", "education"] },
      { id: "glossaire", label: "Glossaire médical", sub: "Définitions claires", icon: "book", color: "#3B82F6", path: "/glossaire" },
      { id: "search", label: "Trouver un confrère", sub: "Annuaire pros", icon: "search", color: "#6366F1", path: "/search" },
      { id: "centres", label: "Centres de santé", sub: "Annuaire PMI, cliniques", icon: "business", color: "#14B8A6", path: "/centres" },
      { id: "support", label: "Aide & Support", sub: "FAQ, contact", icon: "headset", color: "#06B6D4", path: "/aide-support" },
      { id: "support-prem", label: "Support Premium 💎", sub: "FAQ avancée + tutos vidéo + WhatsApp prioritaire", icon: "school", color: "#7C3AED", path: "/support-premium", keywords: ["premium", "formation", "tutoriel"] },
      { id: "2fa-pro", label: "Authentification 2FA", sub: "Optionnel (phase test)", icon: "shield-checkmark", color: "#3B82F6", path: "/security/2fa-setup", keywords: ["2fa", "totp", "securité"] },
      { id: "incident-pro", label: "Signaler un incident", sub: "Sécurité ANSSI", icon: "warning", color: "#EF4444", path: "/security/incident-new", keywords: ["incident", "anssi"] },
    ],
  },
];

export default function MonEspacePro() {
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
      <LinearGradient colors={["#3B82F6", "#06B6D4"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="hub-pro-back">
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mon espace Pro</Text>
          <Text style={styles.sub}>{totalTools} outils en un endroit</Text>
        </View>
      </LinearGradient>

      {/* Recherche */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un outil..."
          placeholderTextColor={COLORS.textMuted}
          testID="hub-pro-search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")} testID="hub-pro-clear">
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs catégories */}
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
  tabActive: { backgroundColor: "#3B82F6", borderColor: "#3B82F6" },
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
