/**
 * Bilan rapide DMP — Mode carousel un-jalon-à-la-fois.
 * Idéal pendant une consultation pédiatrique : 2 gros boutons Oui/Non + Skip + Progression.
 */
import { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";

type Item = {
  id: string;
  domaine: string;
  titre: string;
  description: string;
  age_typique: number;
  age_alerte: number;
  emoji: string;
};

type Bilan = {
  enfant: { id: string; nom: string; date_naissance?: string };
  age_mois: number;
  items: Item[];
  total: number;
};

const DOMAIN_COLORS: Record<string, string> = {
  moteur_global: "#EF4444",
  moteur_fin: "#F97316",
  langage_receptif: "#3B82F6",
  langage_expressif: "#8B5CF6",
  cognitif: "#10B981",
  social_emotionnel: "#EC4899",
  autonomie: "#F59E0B",
};

const DOMAIN_LABELS: Record<string, string> = {
  moteur_global: "Moteur global",
  moteur_fin: "Moteur fin",
  langage_receptif: "Langage réceptif",
  langage_expressif: "Langage expressif",
  cognitif: "Cognitif",
  social_emotionnel: "Social-émotionnel",
  autonomie: "Autonomie",
};

export default function BilanRapide() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Bilan | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<string, "oui" | "non">>({});
  const [done, setDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const load = async () => {
    try {
      const r = await api.get(`/enfants/${id}/dmp/bilan-rapide`);
      setData(r.data);
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible de démarrer le bilan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const animateNext = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const respond = async (value: "oui" | "non") => {
    if (!data || submitting) return;
    const item = data.items[idx];
    if (!item) return;
    setSubmitting(true);
    try {
      await api.post(`/enfants/${id}/dmp/${item.id}`, { response: value });
      setResults((prev) => ({ ...prev, [item.id]: value }));
      animateNext();
      // Avancer
      setTimeout(() => {
        if (idx + 1 >= data.items.length) {
          setDone(true);
        } else {
          setIdx(idx + 1);
        }
        setSubmitting(false);
      }, 200);
    } catch (e: any) {
      Alert.alert("Erreur", "Enregistrement impossible");
      setSubmitting(false);
    }
  };

  const skip = () => {
    if (!data || submitting) return;
    animateNext();
    setTimeout(() => {
      if (idx + 1 >= data.items.length) {
        setDone(true);
      } else {
        setIdx(idx + 1);
      }
    }, 200);
  };

  const back = () => {
    if (idx > 0) {
      animateNext();
      setTimeout(() => setIdx(idx - 1), 100);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data) return null;

  // Cas : aucun jalon en attente
  if (data.items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient colors={["#10B981", "#0EA5E9"]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bilan rapide</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>
        <View style={styles.empty}>
          <Text style={{ fontSize: 64 }}>🎉</Text>
          <Text style={styles.emptyTitle}>Bravo ! Tout est à jour</Text>
          <Text style={styles.emptySub}>
            Aucun jalon attendu pour l'âge de {data.enfant?.nom} n'est en attente de réponse.
            Vous pouvez consulter l'ensemble du suivi.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.back()}>
            <Text style={styles.emptyBtnText}>Voir le suivi complet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Écran final — récap
  if (done) {
    const ouiCount = Object.values(results).filter((v) => v === "oui").length;
    const nonCount = Object.values(results).filter((v) => v === "non").length;
    const skipped = data.items.length - ouiCount - nonCount;
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient colors={["#10B981", "#0EA5E9"]} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bilan terminé</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <View style={styles.recapWrap}>
          <Text style={styles.recapEmoji}>✨</Text>
          <Text style={styles.recapTitle}>Bilan terminé !</Text>
          <Text style={styles.recapSub}>
            Vous avez répondu pour {data.enfant?.nom} ({data.age_mois} mois)
          </Text>

          <View style={styles.recapStats}>
            <View style={[styles.recapStat, { backgroundColor: "#ECFDF5" }]}>
              <Text style={[styles.recapStatNum, { color: "#10B981" }]}>{ouiCount}</Text>
              <Text style={styles.recapStatLabel}>Oui ✅</Text>
            </View>
            <View style={[styles.recapStat, { backgroundColor: "#FFF7ED" }]}>
              <Text style={[styles.recapStatNum, { color: "#F97316" }]}>{nonCount}</Text>
              <Text style={styles.recapStatLabel}>Pas encore ❌</Text>
            </View>
            <View style={[styles.recapStat, { backgroundColor: "#F3F4F6" }]}>
              <Text style={[styles.recapStatNum, { color: "#6B7280" }]}>{skipped}</Text>
              <Text style={styles.recapStatLabel}>Passés ⏭️</Text>
            </View>
          </View>

          {nonCount > 0 && (
            <View style={styles.recapAlert}>
              <Ionicons name="information-circle" size={18} color="#F97316" />
              <Text style={styles.recapAlertText}>
                {nonCount} jalon{nonCount > 1 ? "s" : ""} non encore acquis. Pensez à en parler à votre pédiatre lors de la prochaine consultation.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.back()}>
            <Text style={styles.emptyBtnText}>Retour au suivi</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const item = data.items[idx];
  const progress = ((idx + 1) / data.items.length) * 100;
  const domainColor = DOMAIN_COLORS[item.domaine] || COLORS.primary;
  const domainLabel = DOMAIN_LABELS[item.domaine] || item.domaine;
  const isLate = data.age_mois > item.age_alerte;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#10B981", "#0EA5E9"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle}>Bilan rapide</Text>
          <Text style={styles.headerSub}>
            {idx + 1} / {data.items.length} · {data.enfant?.nom} ({data.age_mois}m)
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Barre de progression */}
      <View style={styles.progressOuter}>
        <View style={[styles.progressInner, { width: `${progress}%` }]} />
      </View>

      <Animated.View style={[styles.cardWrap, { opacity: fadeAnim }]}>
        <View style={[styles.card, { borderTopColor: domainColor }]}>
          {/* Domaine pill */}
          <View style={[styles.domPill, { backgroundColor: `${domainColor}22` }]}>
            <Text style={[styles.domPillText, { color: domainColor }]}>{domainLabel}</Text>
          </View>

          <Text style={styles.emoji}>{item.emoji}</Text>
          <Text style={styles.titre}>{item.titre}</Text>
          <Text style={styles.desc}>{item.description}</Text>

          <View style={styles.ageInfo}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.ageInfoText}>
              Âge typique : {item.age_typique} mois · Alerte si {item.age_alerte}+ mois
            </Text>
          </View>

          {isLate && (
            <View style={styles.lateBadge}>
              <Ionicons name="warning" size={14} color="#fff" />
              <Text style={styles.lateBadgeText}>Retard possible — important</Text>
            </View>
          )}

          {/* Question */}
          <Text style={styles.question}>
            {data.enfant?.nom || "L'enfant"} y arrive ?
          </Text>

          {/* Boutons Oui / Non — gros */}
          <View style={styles.bigBtnRow}>
            <TouchableOpacity
              style={[styles.bigBtn, styles.bigOui]}
              onPress={() => respond("oui")}
              disabled={submitting}
              testID="bilan-btn-oui"
            >
              <Ionicons name="checkmark-circle" size={32} color="#fff" />
              <Text style={styles.bigBtnText}>Oui</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bigBtn, styles.bigNon]}
              onPress={() => respond("non")}
              disabled={submitting}
              testID="bilan-btn-non"
            >
              <Ionicons name="close-circle" size={32} color="#fff" />
              <Text style={styles.bigBtnText}>Pas encore</Text>
            </TouchableOpacity>
          </View>

          {/* Skip + Back */}
          <View style={styles.smallRow}>
            <TouchableOpacity onPress={back} disabled={idx === 0} style={[styles.smallBtn, idx === 0 && { opacity: 0.3 }]} testID="bilan-btn-back">
              <Ionicons name="chevron-back" size={16} color={COLORS.textSecondary} />
              <Text style={styles.smallBtnText}>Précédent</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={skip} style={styles.smallBtn} testID="bilan-btn-skip">
              <Text style={styles.smallBtnText}>Passer</Text>
              <Ionicons name="play-skip-forward" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, paddingBottom: 14, gap: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  progressOuter: { height: 4, backgroundColor: "#E5E7EB" },
  progressInner: { height: "100%", backgroundColor: "#10B981" },

  cardWrap: { flex: 1, padding: SPACING.lg, justifyContent: "center" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 22, borderTopWidth: 4, ...SHADOW },
  domPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 16 },
  domPillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },

  emoji: { fontSize: 56, textAlign: "center", marginBottom: 8 },
  titre: { fontSize: 22, fontWeight: "900", color: COLORS.textPrimary, textAlign: "center", marginBottom: 8 },
  desc: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 14 },

  ageInfo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 8 },
  ageInfoText: { fontSize: 11, color: COLORS.textMuted },

  lateBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "#EF4444", borderRadius: 999, marginTop: 6 },
  lateBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  question: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center", marginTop: 22, marginBottom: 14 },

  bigBtnRow: { flexDirection: "row", gap: 10 },
  bigBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 18, borderRadius: 16, ...SHADOW },
  bigOui: { backgroundColor: "#10B981" },
  bigNon: { backgroundColor: "#F97316" },
  bigBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  smallRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  smallBtnText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10 },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textPrimary },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 999, backgroundColor: COLORS.primary },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  recapWrap: { flex: 1, alignItems: "center", padding: 30 },
  recapEmoji: { fontSize: 64, marginBottom: 8 },
  recapTitle: { fontSize: 24, fontWeight: "900", color: COLORS.textPrimary, marginBottom: 6 },
  recapSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginBottom: 24 },
  recapStats: { flexDirection: "row", gap: 10, width: "100%", marginBottom: 16 },
  recapStat: { flex: 1, padding: 16, borderRadius: RADIUS.md, alignItems: "center" },
  recapStatNum: { fontSize: 32, fontWeight: "900" },
  recapStatLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 4 },
  recapAlert: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: "#FFF7ED", borderRadius: RADIUS.md, borderLeftWidth: 3, borderLeftColor: "#F97316", marginTop: 10 },
  recapAlertText: { flex: 1, fontSize: 12, color: "#9A3412", lineHeight: 17 },
});
