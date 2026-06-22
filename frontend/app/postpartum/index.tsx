import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { cachedGet } from "../../lib/offline";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function PostpartumHome() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<number | null>(null);

  const load = async () => {
    try {
      setErr(null);
      // Direct call to avoid cachedGet's empty-array fallback obscuring 404
      const { api } = await import("../../lib/api");
      const r = await api.get("/postpartum/dashboard");
      setData(r.data);
    } catch (e: any) {
      setErr(e?.response?.status || 500);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, []));

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  if (err === 404) {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>🌸</Text>
            <Text style={s.emptyTitle}>Moi Aussi — Après l'accouchement</Text>
            <Text style={s.emptyTxt}>
              Un espace bienveillant pour vous accompagner pendant les 12 premiers mois après la naissance.{"\n\n"}
              Vous n'êtes pas seule. Tout ce que vous ressentez est valable.
            </Text>
            <View style={s.featList}>
              {[
                { i: "heart", t: "Suivi hebdomadaire bienveillant" },
                { i: "mic", t: "Mode vocal : « Et toi, comment tu vas ? »" },
                { i: "people", t: "Témoignages anonymes d'autres mamans" },
                { i: "shield-checkmark", t: "Chiffrement AES-256 (RGSSI N3)" },
              ].map((f, i) => (
                <View key={i} style={s.featRow}>
                  <Ionicons name={f.i as any} size={18} color="#EC4899" />
                  <Text style={s.featTxt}>{f.t}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.cta} onPress={() => router.push("/postpartum/setup")}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.ctaTxt}>Démarrer mon suivi</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!data) return <SafeAreaView style={s.loader}><Text>Erreur</Text></SafeAreaView>;

  const fiche = data.current_fiche || {};
  const last = data.last_checkin;
  const lastDateStr = last ? new Date(last.created_at).toLocaleDateString("fr-FR") : null;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero doux */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>BIENVENUE</Text>
          <Text style={s.heroTitle}>{data.label}</Text>
          <Text style={s.heroSub}>Vous êtes précieuse. Ce que vous vivez est important.</Text>
        </View>

        {/* CTA Check-in (le cœur du module) */}
        <TouchableOpacity style={s.checkinCta} onPress={() => router.push("/postpartum/checkin")}>
          <Text style={s.checkinEmoji}>💗</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.checkinTitle}>Et toi, comment tu vas ?</Text>
            <Text style={s.checkinSub}>
              {last ? `Dernier check-in : ${lastDateStr}` : "Faisons le point ensemble (3 minutes)"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Fiche de la semaine */}
        {fiche.title && (
          <View style={s.ficheCard}>
            <Text style={s.ficheBadge}>SEMAINE {fiche.week} POST-PARTUM</Text>
            <Text style={s.ficheTitle}>{fiche.title}</Text>
            <Text style={s.ficheTip}>{fiche.tip}</Text>
          </View>
        )}

        {/* Alertes à garder visibles */}
        {last?.alerts?.length > 0 && (
          <View style={s.alertBox}>
            <Text style={s.alertHead}>⚠️ Suite à votre dernier partage</Text>
            {(last.alerts || []).slice(0, 2).map((a: any, i: number) => (
              <View key={i} style={[s.alertItem, a.level === "critical" && s.alertCrit]}>
                <Text style={[s.alertTitle, a.level === "critical" && { color: "#fff" }]}>{a.title}</Text>
                <Text style={[s.alertMsg, a.level === "critical" && { color: "#FECACA" }]}>{a.message}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Accès rapide soins */}
        <Text style={s.sectionTitle}>Si vous voulez parler maintenant</Text>
        <View style={s.medRow}>
          <TouchableOpacity style={[s.medCard, { backgroundColor: "#EFF6FF" }]} onPress={() => router.push({ pathname: "/rdv-nouveau", params: { mode: "teleconsultation" } } as any)}>
            <Ionicons name="videocam" size={26} color="#2563EB" />
            <Text style={[s.medTxt, { color: "#1E40AF" }]}>Téléconsultation</Text>
            <Text style={s.medSub}>Sage-femme / psy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.medCard, { backgroundColor: "#F0FDF4" }]} onPress={() => router.push({ pathname: "/rdv-nouveau", params: { mode: "domicile" } } as any)}>
            <Ionicons name="home" size={26} color="#16A34A" />
            <Text style={[s.medTxt, { color: "#166534" }]}>À domicile</Text>
            <Text style={s.medSub}>Elle vient chez vous</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.medCard, { backgroundColor: "#FEF2F2" }]} onPress={() => Linking.openURL("tel:185")}>
            <Ionicons name="call" size={26} color="#DC2626" />
            <Text style={[s.medTxt, { color: "#991B1B" }]}>SAMU 185</Text>
            <Text style={s.medSub}>Urgence</Text>
          </TouchableOpacity>
        </View>

        {/* Outils */}
        <Text style={s.sectionTitle}>Mes outils</Text>
        <View style={s.grid}>
          {[
            { id: "historique", label: "Mon historique", icon: "calendar", color: "#EC4899", nav: "/postpartum/historique" },
            { id: "testimonials", label: "Elles en parlent", icon: "chatbubbles", color: "#8B5CF6", nav: "/postpartum/testimonials" },
            { id: "conjoint", label: "Mon conjoint", icon: "people", color: "#06B6D4", nav: "/postpartum/conjoint" },
          ].map((tt) => (
            <TouchableOpacity key={tt.id} style={s.gridItem} onPress={() => router.push(tt.nav as any)}>
              <View style={[s.gridIcon, { backgroundColor: tt.color + "22" }]}>
                <Ionicons name={tt.icon as any} size={22} color={tt.color} />
              </View>
              <Text style={s.gridLabel}>{tt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.gentle}>
          <Ionicons name="information-circle" size={18} color="#EC4899" />
          <Text style={s.gentleTxt}>
            💗 Vous n'êtes pas seule. 1 maman sur 7 vit une dépression post-partum. C'est traitable et ce n'est PAS de votre faute.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FDF2F8" },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  emptyCard: { padding: SPACING.xl, backgroundColor: "#fff", borderRadius: RADIUS.lg, alignItems: "center" },
  emptyEmoji: { fontSize: 60, marginBottom: 14 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  emptyTxt: { color: COLORS.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 18 },
  featList: { width: "100%", gap: 10, marginBottom: 20 },
  featRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  featTxt: { color: COLORS.textPrimary, flex: 1, fontSize: 13 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EC4899", paddingVertical: 14, paddingHorizontal: 24, borderRadius: RADIUS.pill, width: "100%" },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  hero: { padding: SPACING.lg, backgroundColor: "#EC4899", borderRadius: RADIUS.lg, marginBottom: 14 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.95)", fontSize: 13, marginTop: 6, lineHeight: 18 },
  checkinCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#9333EA", borderRadius: RADIUS.lg, marginBottom: 14 },
  checkinEmoji: { fontSize: 32 },
  checkinTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  checkinSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
  ficheCard: { padding: SPACING.lg, backgroundColor: "#fff", borderRadius: RADIUS.lg, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: "#EC4899" },
  ficheBadge: { fontSize: 10, fontWeight: "800", color: "#EC4899", letterSpacing: 1.2 },
  ficheTitle: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary, marginTop: 4 },
  ficheTip: { color: COLORS.textPrimary, fontSize: 13, lineHeight: 20, marginTop: 8 },
  alertBox: { padding: SPACING.lg, backgroundColor: "#fff", borderRadius: RADIUS.lg, marginBottom: 14 },
  alertHead: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  alertItem: { padding: 12, backgroundColor: "#FEF3C7", borderRadius: RADIUS.md, marginBottom: 8 },
  alertCrit: { backgroundColor: "#DC2626" },
  alertTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  alertMsg: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, fontSize: 14 },
  medRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  medCard: { flex: 1, padding: 12, borderRadius: RADIUS.md, alignItems: "center" },
  medTxt: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  medSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  grid: { flexDirection: "row", gap: 8, marginBottom: 14 },
  gridItem: { flex: 1, padding: 12, backgroundColor: "#fff", borderRadius: RADIUS.md, alignItems: "center" },
  gridIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  gridLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "700", textAlign: "center" },
  gentle: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md, alignItems: "flex-start" },
  gentleTxt: { flex: 1, color: "#831843", fontSize: 12, lineHeight: 17 },
});
