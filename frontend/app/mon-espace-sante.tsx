/**
 * Mon espace santé — Hub central de TOUS les outils maman.
 * Organisé en 6 catégories thématiques + recherche.
 */
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

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
// 6 CATÉGORIES — TOUS LES OUTILS MAMAN
// ============================================================================
const CATEGORIES: Category[] = [
  {
    key: "medical",
    label: "Suivi médical",
    emoji: "🏥",
    tools: [
      { id: "dossier", label: "Dossier médical", sub: "Vue synthétique", icon: "document-text", color: "#14B8A6", path: "/dossier-medical" },
      { id: "mes-notes", label: "Mes notes médicales", sub: "Notes des pros", icon: "reader", color: "#06B6D4", path: "/mes-notes", keywords: ["consultation", "diagnostic"] },
      { id: "documents", label: "Documents", sub: "Analyses, ordonnances, échos", icon: "folder", color: "#0EA5E9", path: "/documents", keywords: ["pdf", "scan"] },
      { id: "rdv", label: "Rendez-vous", sub: "Calendrier des consultations", icon: "calendar", color: "#A855F7", path: "/(tabs)/rdv" },
      { id: "agenda", label: "Agenda complet", sub: "Tous mes rappels", icon: "calendar-outline", color: "#F59E0B", path: "/agenda" },
      { id: "questions", label: "Questions au pro", sub: "Demander à un spécialiste", icon: "help-circle", color: "#10B981", path: "/questions" },
      { id: "partage", label: "Partage sécurisé", sub: "Code CMU pour pros", icon: "shield-checkmark", color: "#EF4444", path: "/partage-dossier", keywords: ["acces", "consentement"] },
      { id: "consentements", label: "Consentements", sub: "Pilotez qui voit quoi", icon: "lock-closed", color: "#10B981", path: "/consentements", keywords: ["consent", "rgpd", "vie privee"] },
      { id: "audit", label: "Journal d'accès", sub: "Qui a vu mes données ?", icon: "search", color: "#6366F1", path: "/audit-log", keywords: ["audit", "transparence"] },
      { id: "2fa", label: "Authentification 2FA", sub: "Sécurité renforcée", icon: "shield-checkmark", color: "#3B82F6", path: "/security/2fa-setup", keywords: ["2fa", "totp", "authenticator"] },
      { id: "incident", label: "Signaler un incident", sub: "Sécurité ANSSI", icon: "warning", color: "#EF4444", path: "/security/incident-new", keywords: ["incident", "anssi", "sécurité"] },
      { id: "secdocs", label: "Documents de sécurité", sub: "PSSI, PAS, RGSSI", icon: "document-text", color: "#6366F1", path: "/security/docs", keywords: ["pssi", "rgssi", "anssi"] },
      { id: "fhir", label: "Interopérabilité (FHIR)", sub: "Export santé universel", icon: "swap-horizontal", color: "#6366F1", path: "/fhir", keywords: ["export", "hl7"] },
    ],
  },
  {
    key: "grossesse",
    label: "Grossesse",
    emoji: "🤰",
    tools: [
      { id: "grossesse", label: "Suivi grossesse", sub: "Semaine par semaine", icon: "heart", color: "#F472B6", path: "/(tabs)/grossesse" },
      { id: "foetus", label: "Foetus S/S", sub: "Développement bébé", icon: "egg", color: "#EC4899", path: "/foetus", keywords: ["bebe", "fetus"] },
      { id: "echo", label: "Télé-échographie", sub: "Consultation à distance", icon: "scan", color: "#8B5CF6", path: "/tele-echo" },
      { id: "plan-naissance", label: "Plan de naissance", sub: "Préparer l'accouchement", icon: "clipboard", color: "#EC4899", path: "/plan-naissance", keywords: ["accouchement"] },
      { id: "naissance", label: "Déclarer naissance", sub: "Acte officiel", icon: "balloon", color: "#14B8A6", path: "/naissance" },
      { id: "trimestres", label: "Trimestres", sub: "Étapes par trimestre", icon: "list", color: "#A855F7", path: "/grossesse/trimestres" },
      { id: "nutrition", label: "Nutrition grossesse", sub: "Aliments à privilégier", icon: "nutrition", color: "#10B981", path: "/grossesse/nutrition" },
      { id: "rappels-g", label: "Rappels grossesse", sub: "Examens à ne pas manquer", icon: "alarm", color: "#F59E0B", path: "/grossesse/rappels" },
    ],
  },
  {
    key: "enfants",
    label: "Mes enfants",
    emoji: "👶",
    tools: [
      { id: "enfants", label: "Mes enfants", sub: "Carnets de santé", icon: "happy", color: "#3B82F6", path: "/(tabs)/enfants" },
      { id: "carnet", label: "Carnet médical", sub: "Vue par âge + export FHIR/PDF", icon: "book", color: "#0E7C3E", path: "/(tabs)/enfants", keywords: ["interop", "fhir", "vaccin", "croissance"] },
      { id: "dmp", label: "DMP — 7 axes", sub: "Détection précoce", icon: "pulse", color: "#0EA5E9", path: "/dmp", keywords: ["developpement", "jalons"] },
      { id: "jalons", label: "Étapes de développement", sub: "Vue d'ensemble", icon: "checkmark-done", color: "#10B981", path: "/jalons" },
      { id: "diversification", label: "Diversification", sub: "Alimentation bébé", icon: "restaurant", color: "#F59E0B", path: "/diversification", keywords: ["aliments"] },
      { id: "activites", label: "Activités d'éveil", sub: "Jeux & stimulation", icon: "game-controller", color: "#10B981", path: "/activites", keywords: ["jeu", "eveil"] },
      { id: "maison", label: "Maison sécurisée", sub: "Sécurité bébé/enfant", icon: "home", color: "#0EA5E9", path: "/maison-securisee" },
      { id: "post-partum", label: "Post-partum", sub: "Suivi bébé + maman", icon: "heart-circle", color: "#06B6D4", path: "/post-partum" },
      { id: "sommeil", label: "Sommeil bébé", sub: "Qualité + heures", icon: "moon", color: "#6366F1", path: "/sommeil" },
    ],
  },
  {
    key: "bien-etre",
    label: "Bien-être & Cycle",
    emoji: "🌸",
    tools: [
      { id: "cycle", label: "Cycle menstruel", sub: "Ovulation, règles, fertilité", icon: "flower", color: "#E11D48", path: "/cycle" },
      { id: "contraception", label: "Contraception", sub: "Suivi méthode", icon: "shield-checkmark", color: "#F59E0B", path: "/contraception" },
      { id: "sommeil-maman", label: "Sommeil & repos", sub: "Qualité du repos", icon: "moon-outline", color: "#8B5CF6", path: "/sommeil" },
    ],
  },
  {
    key: "education",
    label: "Apprendre",
    emoji: "📚",
    tools: [
      { id: "ressources", label: "Ressources éducatives", sub: "Vidéos, fiches, conseils", icon: "library", color: "#A855F7", path: "/ressources", keywords: ["video", "education"] },
      { id: "quiz", label: "Quiz éducatifs", sub: "Testez vos connaissances", icon: "school", color: "#10B981", path: "/quiz" },
      { id: "glossaire", label: "Glossaire médical", sub: "Définitions claires", icon: "book", color: "#3B82F6", path: "/glossaire", keywords: ["dictionnaire"] },
      { id: "infolettre", label: "Infolettre", sub: "Recevoir les actus", icon: "mail", color: "#EC4899", path: "/infolettre" },
    ],
  },
  {
    key: "connect",
    label: "Communauté & Famille",
    emoji: "👥",
    tools: [
      { id: "famille", label: "Famille connectée", sub: "Partager avec mes proches", icon: "people-circle", color: "#F59E0B", path: "/famille" },
      { id: "communaute", label: "Communauté", sub: "Échanger entre mamans", icon: "chatbubbles", color: "#10B981", path: "/(tabs)/communaute" },
      { id: "centres", label: "Centres de santé", sub: "Annuaire PMI, cliniques", icon: "business", color: "#A855F7", path: "/centres" },
      { id: "medecins", label: "Trouver un médecin", sub: "Annuaire pros", icon: "medical", color: "#6366F1", path: "/search" },
      { id: "parrainage", label: "Parrainage", sub: "+7 jours Premium par filleule", icon: "gift", color: "#DB2777", path: "/parrainage" },
    ],
  },
  {
    key: "admin",
    label: "Administratif",
    emoji: "📑",
    tools: [
      { id: "cmu", label: "CMU", sub: "Couverture santé universelle", icon: "shield", color: "#16A34A", path: "/cmu", keywords: ["assurance"] },
      { id: "premium", label: "Passer Premium", sub: "Accès illimité", icon: "diamond", color: "#F59E0B", path: "/premium" },
      { id: "offres-part", label: "Offres partenaires 💎", sub: "Réductions Pharmacies / Crèches", icon: "gift", color: "#EC4899", path: "/offres-partenaires", keywords: ["promo", "code", "remise"] },
      { id: "ligne-ecoute", label: "Ligne d'écoute 💎", sub: "Soutien post-partum", icon: "headset", color: "#EC4899", path: "/ligne-ecoute", keywords: ["babyblues", "depression", "post-partum"] },
      { id: "rappels-ia", label: "Rappels IA 💎", sub: "Personnalisés par Claude", icon: "sparkles", color: "#A855F7", path: "/rappels-ia", keywords: ["intelligent", "rappel"] },
      { id: "storage", label: "Mon stockage", sub: "Photos, documents, échos", icon: "save", color: "#0EA5E9", path: "/storage-usage", keywords: ["espace", "go", "mo"] },
      { id: "notifications", label: "Notifications", sub: "Centre des alertes", icon: "notifications", color: "#3B82F6", path: "/notifications" },
      { id: "support", label: "Aide & Support", sub: "FAQ, contact", icon: "headset", color: "#06B6D4", path: "/aide-support" },
      { id: "support-prem-maman", label: "Support Premium 💎", sub: "Email prioritaire · Tutos vidéo", icon: "school", color: "#7C3AED", path: "/support-premium", keywords: ["premium", "tuto", "formation"] },
    ],
  },
  {
    key: "calculs",
    label: "Calculateurs",
    emoji: "🧮",
    tools: [
      { id: "outils", label: "Boîte à outils", sub: "DPA, poids, IMC, température", icon: "calculator", color: "#6366F1", path: "/outils", keywords: ["dpa", "poids", "imc", "temperature", "calcul"] },
      { id: "sync", label: "Synchronisation", sub: "File hors ligne, sync auto", icon: "sync", color: "#0EA5E9", path: "/sync", keywords: ["offline", "queue", "synchro"] },
    ],
  },
];

export default function MonEspaceSante() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  // Filtres : recherche + catégorie active
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
      <LinearGradient colors={["#F472B6", "#A855F7"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mon espace santé</Text>
          <Text style={styles.sub}>{totalTools} outils en un endroit</Text>
        </View>
      </LinearGradient>

      {/* Barre de recherche */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher un outil..."
          placeholderTextColor={COLORS.textMuted}
          testID="hub-search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres catégories horizontaux */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catsRow}
      >
        <CatChip label="Tout" active={activeCat === "all"} count={totalTools} onPress={() => setActiveCat("all")} />
        {CATEGORIES.map((c) => (
          <CatChip
            key={c.key}
            label={`${c.emoji} ${c.label}`}
            active={activeCat === c.key}
            count={c.tools.length}
            onPress={() => setActiveCat(activeCat === c.key ? "all" : c.key)}
          />
        ))}
      </ScrollView>

      {/* Grilles par catégorie */}
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {filteredCategories.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun outil ne correspond</Text>
            <Text style={styles.emptyText}>Essayez un autre mot-clé.</Text>
          </View>
        ) : (
          filteredCategories.map((c) => (
            <View key={c.key} style={{ marginBottom: 22 }}>
              <View style={styles.catHeader}>
                <Text style={styles.catEmoji}>{c.emoji}</Text>
                <Text style={styles.catLabel}>{c.label}</Text>
                <View style={styles.catBadge}>
                  <Text style={styles.catBadgeText}>{c.tools.length}</Text>
                </View>
              </View>
              <View style={styles.grid}>
                {c.tools.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => router.push(t.path as any)}
                    style={styles.tile}
                    testID={`tool-${t.id}`}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: `${t.color}22` }]}>
                      <Ionicons name={t.icon as any} size={22} color={t.color} />
                    </View>
                    <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
                    <Text style={styles.tileSub} numberOfLines={2}>{t.sub}</Text>
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

function CatChip({ label, active, count, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.catChip, active && styles.catChipActive]}
    >
      <Text style={[styles.catChipText, active && { color: "#fff" }]}>{label}</Text>
      <View style={[styles.catChipBadge, active && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
        <Text style={[styles.catChipBadgeText, active && { color: "#fff" }]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: SPACING.lg, paddingBottom: 18,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: SPACING.lg, marginTop: 14,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 14, padding: 0 },

  catsRow: { paddingHorizontal: SPACING.lg, paddingVertical: 12, gap: 8, flexDirection: "row" },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  catChipBadge: { backgroundColor: COLORS.primaryLight, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  catChipBadgeText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },

  catHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  catEmoji: { fontSize: 20 },
  catLabel: { flex: 1, fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  catBadge: { backgroundColor: COLORS.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: "800" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "48%", backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  tileLabel: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  tileSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 14 },

  empty: { alignItems: "center", padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: COLORS.textPrimary, marginTop: 14 },
  emptyText: { color: COLORS.textSecondary, marginTop: 4 },
});
