/**
 * Carnet Médical Modulaire de l'Enfant (0-18 ans)
 *
 * - Navigation par onglets d'âge (Naissance, 0-6m, 6-24m, 2-5a, 6-12a, 13-18a)
 * - Vue adaptée au rôle connecté (maman, sage-femme, pédiatre, gynéco, infirmier)
 * - Intégration croissance OMS, vaccins, notes, documents (modules existants)
 * - Mode vocal TTS (lecture à l'écran) pour mamans analphabètes — expo-speech
 * - Accessibilité visuelle : icônes géantes, couleurs codées
 */
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import { api, formatError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";
import MiniGrowthChart from "../../../components/MiniGrowthChart";

// ---------- Helpers âge ----------
function monthsBetween(date_naissance: string): number {
  const ms = Date.now() - new Date(date_naissance).getTime();
  return Math.max(0, Math.floor(ms / (30.44 * 86400000)));
}
function ageLabel(date_naissance: string): string {
  const m = monthsBetween(date_naissance);
  if (m < 1) return "Nouveau-né";
  if (m < 12) return `${m} mois`;
  const a = Math.floor(m / 12);
  const r = m % 12;
  return r > 0 ? `${a} an${a > 1 ? "s" : ""} ${r} m` : `${a} an${a > 1 ? "s" : ""}`;
}

// ---------- Définition des modules par tranche d'âge ----------
type StageKey = "naissance" | "0_6m" | "6_24m" | "2_5a" | "6_12a" | "13_18a";
type Stage = {
  key: StageKey;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  description: string;
};

const STAGES: Stage[] = [
  { key: "naissance", label: "Naissance", icon: "🍼", color: "#EC4899", bgColor: "#FCE7F3", ageMinMonths: 0, ageMaxMonths: 1, description: "Premier mois de vie" },
  { key: "0_6m", label: "0-6 mois", icon: "👶", color: "#F472B6", bgColor: "#FDF2F8", ageMinMonths: 0, ageMaxMonths: 6, description: "Premiers mois" },
  { key: "6_24m", label: "6-24 mois", icon: "🧒", color: "#A855F7", bgColor: "#FAF5FF", ageMinMonths: 6, ageMaxMonths: 24, description: "Éveil et autonomie" },
  { key: "2_5a", label: "2-5 ans", icon: "🎈", color: "#3B82F6", bgColor: "#EFF6FF", ageMinMonths: 24, ageMaxMonths: 60, description: "Petite enfance" },
  { key: "6_12a", label: "6-12 ans", icon: "🎒", color: "#10B981", bgColor: "#ECFDF5", ageMinMonths: 72, ageMaxMonths: 144, description: "Âge scolaire" },
  { key: "13_18a", label: "13-18 ans", icon: "🧑", color: "#F59E0B", bgColor: "#FFFBEB", ageMinMonths: 156, ageMaxMonths: 216, description: "Adolescence" },
];

function isStageUnlocked(stage: Stage, ageMonths: number): boolean {
  return ageMonths >= stage.ageMinMonths;
}
function getDefaultStage(ageMonths: number): StageKey {
  if (ageMonths < 1) return "naissance";
  if (ageMonths < 6) return "0_6m";
  if (ageMonths < 24) return "6_24m";
  if (ageMonths < 60) return "2_5a";
  if (ageMonths < 144) return "6_12a";
  return "13_18a";
}

// ---------- Vues prioritaires par rôle/spécialité ----------
function getRoleFocus(role?: string, specialite?: string): { title: string; items: string[] } {
  const sp = (specialite || "").toLowerCase();
  if (role === "professionnel") {
    if (sp.includes("sage")) return {
      title: "Vue Sage-femme",
      items: ["Croissance 0-6 mois", "Allaitement & alimentation", "Post-partum de la mère", "Déclaration de naissance"],
    };
    if (sp.includes("pédiatre") || sp.includes("pediatre")) return {
      title: "Vue Pédiatre",
      items: ["Courbes OMS complètes", "Calendrier vaccinal EPI", "Développement psychomoteur", "Dépistages & bilans"],
    };
    if (sp.includes("gyné") || sp.includes("obstétr") || sp.includes("obstet")) return {
      title: "Vue Gynéco / Obstétricien",
      items: ["Lien mère-enfant", "Suivi post-natal mère", "Contraception post-partum", "Allaitement"],
    };
    if (sp.includes("infir") || sp.includes("agent")) return {
      title: "Vue Infirmier·ère",
      items: ["Calendrier vaccinal", "Mesures anthropométriques", "Rappels automatiques", "Éducation parentale"],
    };
    return { title: "Vue professionnelle", items: ["Croissance", "Vaccins", "Notes médicales", "Documents"] };
  }
  return { title: "Mon espace", items: ["Taille & poids", "Vaccins", "Rendez-vous", "Photos & souvenirs"] };
}

// ---------- Module card data ----------
type Module = { id: string; title: string; icon: string; color: string; description: string; onPress: () => void };

export default function CarnetModulaire() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();

  const [enfant, setEnfant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeStage, setActiveStage] = useState<StageKey>("0_6m");
  const [ttsOn, setTtsOn] = useState(false);

  const ageMonths = enfant ? monthsBetween(enfant.date_naissance) : 0;
  const focus = getRoleFocus(user?.role, (user as any)?.specialite);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api.get("/enfants");
        const e = (r.data || []).find((x: any) => x.id === id);
        setEnfant(e);
        if (e) setActiveStage(getDefaultStage(monthsBetween(e.date_naissance)));
      } finally { setLoading(false); }
    })();
    return () => { Speech.stop(); };
  }, [id]);

  const speak = async (text: string) => {
    try {
      await Speech.stop();
      if (!ttsOn) return;
      Speech.speak(text, { language: "fr-FR", pitch: 1.0, rate: 0.95 });
    } catch {}
  };

  const toggleTts = async () => {
    if (ttsOn) {
      await Speech.stop();
      setTtsOn(false);
    } else {
      setTtsOn(true);
      if (enfant) {
        Speech.speak(
          `Carnet médical de ${enfant.nom}. ${ageLabel(enfant.date_naissance)}. Appuyez sur un module pour en savoir plus.`,
          { language: "fr-FR", pitch: 1.0, rate: 0.95 },
        );
      }
    }
  };

  const shareCarnet = async () => {
    if (!enfant) return;
    try {
      const msg = `Carnet médical — ${enfant.nom}\nNé(e) le : ${enfant.date_naissance}\nÂge : ${ageLabel(enfant.date_naissance)}\nGroupe sanguin : ${enfant.groupe_sanguin || "—"}\n${enfant.allergies?.length ? "Allergies : " + enfant.allergies.join(", ") : ""}\n\n— À lo Maman`;
      await Share.share({ message: msg });
    } catch {}
  };

  const modules: Module[] = useMemo(() => {
    if (!enfant) return [];
    const stage = STAGES.find((s) => s.key === activeStage)!;
    const items: Module[] = [
      {
        id: "croissance", title: "Croissance OMS", icon: "📏", color: "#06B6D4",
        description: "Taille, poids, périmètre crânien",
        onPress: () => router.push(`/croissance/${enfant.id}`),
      },
      {
        id: "vaccins", title: "Vaccins", icon: "💉", color: "#10B981",
        description: "Calendrier EPI & rappels",
        onPress: () => router.push(`/enfants/${enfant.id}/vaccins`),
      },
      {
        id: "notes", title: "Notes médicales", icon: "📝", color: "#3B82F6",
        description: "Consultations & signatures",
        onPress: () => router.push(`/enfants/${enfant.id}/notes`),
      },
      {
        id: "documents", title: "Documents", icon: "📄", color: "#8B5CF6",
        description: "Analyses, ordonnances, PDF",
        onPress: () => router.push(`/enfants/${enfant.id}/documents`),
      },
      {
        id: "rdv", title: "Rendez-vous", icon: "📅", color: "#F59E0B",
        description: "Consultations passées et à venir",
        onPress: () => router.push("/(tabs)/rdv"),
      },
    ];

    // Modules spécifiques par stage
    if (stage.key === "naissance" || stage.key === "0_6m") {
      items.unshift({
        id: "allaitement", title: "Allaitement", icon: "🍼", color: "#EC4899",
        description: "Suivi des tétées et durée",
        onPress: () => router.push("/post-partum"),
      });
    }
    if (stage.key === "0_6m" || stage.key === "6_24m" || stage.key === "2_5a") {
      items.splice(2, 0, {
        id: "jalons", title: "Jalons & éveil", icon: "🎯", color: "#A855F7",
        description: "Développement psychomoteur",
        onPress: () => router.push(`/enfants/${enfant.id}/jalons`),
      });
    }
    if (stage.key === "6_12a" || stage.key === "13_18a") {
      items.push({
        id: "scolaire", title: "Santé scolaire", icon: "🎓", color: "#F472B6",
        description: "Bilans & vaccins scolaires",
        onPress: () => Alert.alert("Santé scolaire", "Module à venir prochainement."),
      });
    }
    return items;
  }, [enfant, activeStage]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  if (!enfant) return (
    <SafeAreaView style={styles.loading}>
      <Text style={{ color: COLORS.textPrimary }}>Enfant introuvable</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
        <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Retour</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const currentStage = STAGES.find((s) => s.key === activeStage)!;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Carnet de {enfant.nom.split(" ")[0]}</Text>
          <Text style={styles.sub}>{ageLabel(enfant.date_naissance)}</Text>
        </View>
        <TouchableOpacity onPress={toggleTts} style={[styles.iconBtn, ttsOn && { backgroundColor: "#FEF3C7" }]} accessibilityLabel="Activer ou désactiver le mode vocal">
          <Ionicons name={ttsOn ? "volume-high" : "volume-mute"} size={20} color={ttsOn ? "#B45309" : COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={shareCarnet} style={styles.iconBtn}>
          <Ionicons name="share-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Bandeau identité */}
        <LinearGradient colors={[currentStage.color, currentStage.color + "CC"]} style={styles.heroCard}>
          {enfant.photo_url || enfant.photo_base64 ? (
            <Image source={{ uri: enfant.photo_url || enfant.photo_base64 }} style={styles.heroPhoto} />
          ) : (
            <View style={styles.heroPhotoPlaceholder}>
              <Text style={{ fontSize: 40 }}>{currentStage.icon}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{enfant.nom}</Text>
            <Text style={styles.heroAge}>{ageLabel(enfant.date_naissance)}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaText}>{enfant.sexe === "F" ? "👧 Fille" : "👦 Garçon"}</Text>
              {enfant.groupe_sanguin && <Text style={styles.heroMetaText}>· 🩸 {enfant.groupe_sanguin}</Text>}
            </View>
          </View>
        </LinearGradient>

        {/* Allergies critiques (toujours visibles) */}
        {enfant.allergies?.length > 0 && (
          <TouchableOpacity
            style={styles.allergyBanner}
            onPress={() => speak(`Attention, ${enfant.nom} est allergique à ${enfant.allergies.join(", ")}.`)}
          >
            <Ionicons name="warning" size={20} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.allergyTitle}>⚠️ Allergies</Text>
              <Text style={styles.allergyText}>{enfant.allergies.join(" · ")}</Text>
            </View>
            {ttsOn && <Ionicons name="volume-high" size={18} color="#B45309" />}
          </TouchableOpacity>
        )}

        {/* Mini courbe de croissance */}
        <View style={{ paddingHorizontal: SPACING.lg }}>
          <Text style={styles.sectionTitle}>📈 Évolution de la croissance</Text>
          <MiniGrowthChart
            date_naissance={enfant.date_naissance}
            mesures={enfant.mesures || []}
            initialPoids={enfant.poids_kg}
            initialTaille={enfant.taille_cm}
            poids_actuel={enfant.poids_kg}
            taille_actuel={enfant.taille_cm}
            onPressDetails={() => router.push(`/croissance/${enfant.id}`)}
          />
        </View>

        {/* Vue prioritaire selon rôle */}
        <View style={styles.focusCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="star" size={16} color="#F59E0B" />
            <Text style={styles.focusTitle}>{focus.title}</Text>
          </View>
          <View style={styles.focusItems}>
            {focus.items.map((it, i) => (
              <View key={i} style={styles.focusItem}>
                <Text style={styles.focusItemText}>• {it}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Onglets par âge */}
        <Text style={styles.sectionTitle}>📍 Naviguez par âge</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stagesScroll}>
          {STAGES.map((s) => {
            const unlocked = isStageUnlocked(s, ageMonths);
            const active = activeStage === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                disabled={!unlocked}
                onPress={() => { setActiveStage(s.key); speak(`${s.label}. ${s.description}`); }}
                style={[
                  styles.stageChip,
                  { backgroundColor: active ? s.color : s.bgColor, borderColor: active ? s.color : "transparent" },
                  !unlocked && { opacity: 0.35 },
                ]}
              >
                <Text style={styles.stageIcon}>{s.icon}</Text>
                <Text style={[styles.stageLabel, active && { color: "#fff" }]}>{s.label}</Text>
                {!unlocked && <Ionicons name="lock-closed" size={10} color={COLORS.textMuted} style={{ position: "absolute", top: 4, right: 4 }} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Stage actif - description */}
        <View style={[styles.stageBanner, { backgroundColor: currentStage.bgColor }]}>
          <Text style={{ fontSize: 32 }}>{currentStage.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stageBannerTitle, { color: currentStage.color }]}>{currentStage.label}</Text>
            <Text style={styles.stageBannerDesc}>{currentStage.description}</Text>
          </View>
          <TouchableOpacity onPress={() => speak(`${currentStage.label}. ${currentStage.description}`)} style={styles.playBtn}>
            <Ionicons name="play-circle" size={28} color={currentStage.color} />
          </TouchableOpacity>
        </View>

        {/* Grille des modules */}
        <Text style={styles.sectionTitle}>🗂️ Modules disponibles</Text>
        <View style={styles.modulesGrid}>
          {modules.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.moduleCard, { borderLeftColor: m.color }]}
              onPress={() => { speak(`${m.title}. ${m.description}`); setTimeout(m.onPress, ttsOn ? 600 : 0); }}
              accessibilityLabel={`${m.title}. ${m.description}`}
            >
              <View style={[styles.moduleIcon, { backgroundColor: m.color + "15" }]}>
                <Text style={{ fontSize: 32 }}>{m.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.moduleTitle}>{m.title}</Text>
                <Text style={styles.moduleDesc}>{m.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Astuce vocale pour les mamans */}
        {user?.role === "maman" && !ttsOn && (
          <View style={styles.tipCard}>
            <Ionicons name="bulb" size={18} color="#B45309" />
            <Text style={styles.tipText}>
              Activez le mode vocal 🔊 en haut à droite pour que l'application vous lise le carnet à voix haute.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  heroCard: { flexDirection: "row", gap: 14, padding: SPACING.lg, margin: SPACING.lg, borderRadius: RADIUS.lg, alignItems: "center", ...SHADOW },
  heroPhoto: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: "#fff" },
  heroPhotoPlaceholder: { width: 70, height: 70, borderRadius: 35, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  heroName: { fontSize: 20, fontWeight: "800", color: "#fff" },
  heroAge: { fontSize: 14, color: "rgba(255,255,255,0.95)", marginTop: 2, fontWeight: "600" },
  heroMeta: { flexDirection: "row", gap: 6, marginTop: 4 },
  heroMetaText: { color: "rgba(255,255,255,0.95)", fontSize: 12, fontWeight: "600" },

  allergyBanner: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, marginHorizontal: SPACING.lg, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, borderWidth: 1, borderColor: "#F59E0B", marginBottom: 12 },
  allergyTitle: { fontSize: 13, fontWeight: "800", color: "#B45309" },
  allergyText: { fontSize: 12, color: "#92400E", marginTop: 2 },

  focusCard: { marginHorizontal: SPACING.lg, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  focusTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  focusItems: { marginTop: 8, gap: 4 },
  focusItem: {},
  focusItemText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, paddingHorizontal: SPACING.lg, marginTop: 6, marginBottom: 8 },

  stagesScroll: { paddingHorizontal: SPACING.lg, gap: 8, paddingBottom: 8 },
  stageChip: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.md, minWidth: 82, borderWidth: 2 },
  stageIcon: { fontSize: 28 },
  stageLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },

  stageBanner: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: SPACING.lg, padding: 14, borderRadius: RADIUS.md, marginTop: 6, marginBottom: 6 },
  stageBannerTitle: { fontSize: 16, fontWeight: "800" },
  stageBannerDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  playBtn: { padding: 4 },

  modulesGrid: { paddingHorizontal: SPACING.lg, gap: 10 },
  moduleCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4, ...SHADOW },
  moduleIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  moduleTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  moduleDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  tipCard: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, backgroundColor: "#FEF3C7", marginHorizontal: SPACING.lg, marginTop: 14, borderRadius: RADIUS.md },
  tipText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },
});
