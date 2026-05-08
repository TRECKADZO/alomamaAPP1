/**
 * Rappels IA contextuels 🔔 — Générés par Claude Sonnet selon le stade de grossesse / bébé.
 * Réservé aux Mamans Premium.
 * Route: /rappels-ia
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import PremiumGate from "../components/PremiumGate";

export default function RappelsIA() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [premiumBlocked, setPremiumBlocked] = useState<string | null>(null);
  const [contexte, setContexte] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/ai/rappels-contextuels");
      setItems(r.data?.rappels || []);
    } catch (e) {
      console.warn("Load rappels failed", e);
    } finally {
      setLoading(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setPremiumBlocked(null);
    try {
      const r = await api.post("/ai/rappels-contextuels", { contexte });
      setItems((r.data?.rappels || []).concat(items));
      setContexte("");
      Alert.alert("✨ Généré !", `${r.data?.count || 0} rappels personnalisés ajoutés.`);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        setPremiumBlocked(detail.message || "Réservé Maman Premium.");
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => { load(); }, []);

  const urgenceColor = (u: string) => {
    if (u === "haute") return "#EF4444";
    if (u === "moyenne") return "#F59E0B";
    return "#3B82F6";
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EC4899", "#BE185D"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rappels IA 🔔</Text>
          <Text style={styles.sub}>Personnalisés par Claude Sonnet · Premium</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {premiumBlocked ? (
          <PremiumGate
            message={premiumBlocked}
            color="#EC4899"
            ctaLabel="Devenir Maman Premium"
            benefits="Avec Maman Premium : Rappels personnalisés contextuels (selon votre stade), IA Claude illimitée, support 24/7."
          />
        ) : (
          <>
            <View style={styles.genBox}>
              <Text style={styles.genTitle}>✨ Générer des rappels personnalisés</Text>
              <Text style={styles.genHint}>Ajoutez un contexte personnel (facultatif) pour des rappels encore mieux ciblés.</Text>
              <TextInput
                style={styles.input}
                multiline
                placeholder="Ex : Je suis à 28 SA, j'ai des nausees légères. Bébé bouge bien."
                placeholderTextColor={COLORS.textMuted}
                value={contexte}
                onChangeText={setContexte}
              />
              <TouchableOpacity style={[styles.genBtn, generating && { opacity: 0.5 }]} disabled={generating} onPress={generate}>
                {generating ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#fff" />
                    <Text style={styles.genBtnText}>Générer 5 rappels</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.section}>📜 Mes rappels</Text>
            {loading && <ActivityIndicator color={COLORS.primary} />}
            {!loading && items.length === 0 && (
              <Text style={styles.empty}>Aucun rappel encore. Cliquez sur « Générer 5 rappels » pour démarrer.</Text>
            )}
            {items.map((r) => (
              <View key={r.id} style={[styles.rappelCard, { borderLeftColor: urgenceColor(r.urgence) }]}>
                <View style={styles.rappelHead}>
                  <View style={[styles.urgBadge, { backgroundColor: urgenceColor(r.urgence) }]}>
                    <Text style={styles.urgText}>{(r.urgence || "info").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.rappelTitle}>{r.titre}</Text>
                </View>
                <Text style={styles.rappelDesc}>{r.description}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  genBox: { backgroundColor: "#FCE7F3", padding: 14, borderRadius: RADIUS.md, marginBottom: 18 },
  genTitle: { fontSize: 14, fontWeight: "800", color: "#9F1239", marginBottom: 6 },
  genHint: { fontSize: 11, color: "#9F1239", marginBottom: 10, lineHeight: 15 },
  input: { borderWidth: 1, borderColor: "#F9A8D4", padding: 10, borderRadius: 8, fontSize: 13, color: COLORS.textPrimary, marginBottom: 10, backgroundColor: "#fff", minHeight: 70 },
  genBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EC4899", padding: 12, borderRadius: 8 },
  genBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  section: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8, marginBottom: 10 },
  empty: { fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 20 },
  rappelCard: { backgroundColor: COLORS.surface, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: COLORS.border },
  rappelHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  urgBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  urgText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  rappelTitle: { flex: 1, fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  rappelDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginTop: 4 },
});
