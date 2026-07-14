import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { cachedGet } from "../../lib/offline";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function PostpartumHome() {
import NearbyEstablishments from "../../components/NearbyEstablishments";

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
    // Mode découverte — pas encore de setup. Tout est accessible sauf check-in/historique.
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.discoveryHero}>
            <Text style={s.emptyEmoji}>🌸</Text>
            <Text style={s.emptyTitle}>Moi Aussi — Après l&apos;accouchement</Text>
            <Text style={s.emptyTxt}>
              Un espace bienveillant pour les 12 premiers mois après la naissance.{"\n"}
              Vous n&apos;êtes pas seule. Tout ce que vous ressentez est valable.
            </Text>
          </View>

          {/* CTA principal : démarrer suivi */}
          <TouchableOpacity style={s.discoveryCta} onPress={() => router.push("/postpartum/setup" as any)}>
            <View style={s.discoveryCtaIcon}><Ionicons name="heart" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.discoveryCtaTitle}>Démarrer mon suivi personnalisé</Text>
              <Text style={s.discoveryCtaSub}>Check-in hebdomadaire, alertes EPDS, chiffré AES-256</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>

          <Text style={s.sectionTitle}>Explorer librement (sans inscription)</Text>
          <View style={s.discoveryGrid}>
            <TouchableOpacity style={s.discoveryItem} onPress={() => router.push("/postpartum/fiches" as any)}>
              <View style={[s.discoveryItemIcon, { backgroundColor: "#FCE7F3" }]}>
                <Ionicons name="book" size={24} color="#EC4899" />
              </View>
              <Text style={s.discoveryItemLabel}>Conseils semaine par semaine</Text>
              <Text style={s.discoveryItemSub}>52 fiches éducatives</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discoveryItem} onPress={() => router.push("/postpartum/testimonials" as any)}>
              <View style={[s.discoveryItemIcon, { backgroundColor: "#F3E8FF" }]}>
                <Ionicons name="chatbubbles" size={24} color="#8B5CF6" />
              </View>
              <Text style={s.discoveryItemLabel}>Elles en parlent</Text>
              <Text style={s.discoveryItemSub}>Témoignages anonymes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discoveryItem} onPress={() => router.push("/postpartum/conjoint" as any)}>
              <View style={[s.discoveryItemIcon, { backgroundColor: "#CFFAFE" }]}>
                <Ionicons name="people" size={24} color="#06B6D4" />
              </View>
              <Text style={s.discoveryItemLabel}>Pour mon conjoint</Text>
              <Text style={s.discoveryItemSub}>Checklist + messages</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discoveryItem} onPress={() => Linking.openURL("tel:185")}>
              <View style={[s.discoveryItemIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="call" size={24} color="#DC2626" />
              </View>
              <Text style={s.discoveryItemLabel}>SAMU 185</Text>
              <Text style={s.discoveryItemSub}>Urgence</Text>
            </TouchableOpacity>
          </View>

          <View style={s.featList}>
            <Text style={s.featHead}>Ce que vous obtenez avec le suivi personnalisé :</Text>
            {[
              { i: "heart", t: "Check-in hebdomadaire — « Et toi, comment tu vas ? »" },
              { i: "mic", t: "Mode vocal complet (français)" },
              { i: "trending-up", t: "Courbe d'humeur et historique sécurisé" },
              { i: "warning", t: "Alertes EPDS (dépression post-partum)" },
              { i: "shield-checkmark", t: "Chiffrement AES-256 (RGSSI N3)" },
            ].map((f, i) => (
              <View key={i} style={s.featRow}>
                <Ionicons name={f.i as any} size={16} color="#EC4899" />
                <Text style={s.featTxt}>{f.t}</Text>
              </View>
            ))}
          </View>

          <View style={s.gentle}>
            <Ionicons name="information-circle" size={18} color="#EC4899" />
            <Text style={s.gentleTxt}>
              💗 1 maman sur 7 vit une dépression post-partum. C&apos;est traitable et ce n&apos;est PAS de votre faute.
            </Text>
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
            { id: "fiches", label: "Conseils S1-S52", icon: "book", color: "#F97316", nav: "/postpartum/fiches" },
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

        {/* Établissements proches (Phase 3) — Si alerte critique ou EPDS > 12 */}
        {(last?.critical_alerts?.length > 0 || (last?.epds_score ?? 0) > 12) && (
          <NearbyEstablishments
            context="postpartum"
            alertType={last?.epds_score > 12 ? "depression" : "medical"}
            limit={3}
          />
        )}

        {/* Export PDF */}
        <TouchableOpacity
          style={s.pdfBtn}
          onPress={async () => {
            try {
              const { Platform, Share } = require("react-native");
              const r = await (await import("../../lib/api")).api.get("/postpartum/report/pdf", { responseType: "blob" as any });
              if (Platform.OS === "web") {
                const blob = r.data instanceof Blob ? r.data : new Blob([r.data], { type: "application/pdf" });
                const dlUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = dlUrl;
                a.download = `postpartum_rapport_${new Date().toISOString().slice(0, 10)}.pdf`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(dlUrl);
              } else {
                await Share.share({ url: r.request?.responseURL || "", title: "Rapport Post-Partum" });
              }
            } catch (e: any) {
              Alert.alert("Erreur", "Impossible de générer le PDF.");
            }
          }}
          testID="pp-export-pdf"
        >
          <Ionicons name="document-text" size={18} color="#fff" />
          <Text style={s.pdfBtnTxt}>📄 Exporter mon rapport PDF</Text>
        </TouchableOpacity>

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
  emptyTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, textAlign: "center" },
  emptyTxt: { color: COLORS.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 18 },
  discoveryHero: { padding: SPACING.lg, alignItems: "center", marginBottom: 16 },
  discoveryCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, backgroundColor: "#EC4899", borderRadius: RADIUS.lg, marginBottom: 18 },
  discoveryCtaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  discoveryCtaTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  discoveryCtaSub: { color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 2 },
  discoveryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  discoveryItem: { width: "47.5%", padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.md, alignItems: "flex-start" },
  discoveryItemIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  discoveryItemLabel: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  discoveryItemSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  featList: { gap: 10, padding: SPACING.lg, backgroundColor: "#FCE7F3", borderRadius: RADIUS.lg, marginBottom: 14 },
  featHead: { fontWeight: "800", color: "#831843", fontSize: 13, marginBottom: 4 },
  featRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  featTxt: { color: "#831843", flex: 1, fontSize: 12, lineHeight: 17 },
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
  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#7C3AED", paddingVertical: 12, borderRadius: RADIUS.md, marginBottom: 14 },
  pdfBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
