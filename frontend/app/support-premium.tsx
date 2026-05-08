/**
 * Support dédié + Formation en ligne 💎
 * Page Premium pour Pros & Centres : FAQ, tutos vidéo, contact prioritaire.
 * Route: /support-premium
 */
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

type Tuto = { id: string; title: string; duration: string; topic: string; icon: any; color: string };
type Faq = { q: string; a: string };

const TUTOS_MAMAN: Tuto[] = [
  { id: "m1", title: "Ajouter mes 5 enfants au carnet de santé", duration: "3 min", topic: "enfants", icon: "people", color: "#EC4899" },
  { id: "m2", title: "Discuter avec l'IA Claude 24/7", duration: "4 min", topic: "IA", icon: "sparkles", color: "#A855F7" },
  { id: "m3", title: "Profiter des offres partenaires", duration: "3 min", topic: "offres", icon: "gift", color: "#F59E0B" },
  { id: "m4", title: "Joindre la ligne d'écoute post-partum", duration: "2 min", topic: "écoute", icon: "headset", color: "#10B981" },
  { id: "m5", title: "Partager le carnet avec mes 4 proches", duration: "4 min", topic: "famille", icon: "people-circle", color: "#3B82F6" },
];

const FAQ_MAMAN: Faq[] = [
  { q: "Puis-je avoir plus de 1 enfant en gratuit ?", a: "Non, le compte gratuit est limité à 1 enfant. Maman Premium permet jusqu'à 5 enfants." },
  { q: "L'IA Claude est-elle vraiment illimitée ?", a: "Oui, en Premium aucune limite. En gratuit, c'est 5 questions/mois." },
  { q: "Comment réserver une session d'écoute ?", a: "Dans /ligne-ecoute, cliquez sur « Réserver une session ». Notre équipe répond sous 2h." },
  { q: "Combien de proches puis-je ajouter à ma famille ?", a: "Jusqu'à 4 proches en Premium. En gratuit, le partage famille n'est pas activé." },
];

const TUTOS_PRO: Tuto[] = [
  { id: "p1", title: "Configurer mes disponibilités", duration: "4 min", topic: "agenda", icon: "time", color: "#06B6D4" },
  { id: "p2", title: "Démarrer une téléconsultation HD", duration: "5 min", topic: "vidéo", icon: "videocam", color: "#EC4899" },
  { id: "p3", title: "Utiliser l'IA Pro pour rédiger un compte-rendu", duration: "6 min", topic: "IA", icon: "sparkles", color: "#A855F7" },
  { id: "p4", title: "Exporter ma comptabilité mensuelle", duration: "3 min", topic: "compta", icon: "document-attach", color: "#0EA5E9" },
  { id: "p5", title: "Recevoir un retrait Mobile Money", duration: "4 min", topic: "paiements", icon: "card", color: "#F59E0B" },
];

const TUTOS_CENTRE: Tuto[] = [
  { id: "c1", title: "Inviter mes pros membres", duration: "3 min", topic: "membres", icon: "person-add", color: "#3B82F6" },
  { id: "c2", title: "Lire le tableau de bord agrégé", duration: "5 min", topic: "stats", icon: "stats-chart", color: "#A855F7" },
  { id: "c3", title: "Consulter la finance par pro", duration: "4 min", topic: "finance", icon: "cash", color: "#10B981" },
  { id: "c4", title: "Exporter en CSV/JSON pour mon comptable", duration: "3 min", topic: "export", icon: "cloud-download", color: "#0EA5E9" },
  { id: "c5", title: "Configurer la grille tarifaire personnalisée", duration: "5 min", topic: "tarifs", icon: "pricetag", color: "#F59E0B" },
];

const FAQ_PRO: Faq[] = [
  { q: "Comment activer ma commission Premium à 5% ?", a: "Elle s'active automatiquement dès que votre abonnement Pro Premium est validé. La commission précédente (10%) ne s'applique plus aux nouveaux RDV." },
  { q: "Puis-je avoir plus de 10 patientes en gratuit ?", a: "Non, le compte gratuit est limité à 10 patientes uniques. Au-delà, les nouvelles patientes ne peuvent plus prendre RDV chez vous tant que vous n'êtes pas Premium. Les patientes existantes restent bien sûr accessibles." },
  { q: "L'IA Pro consomme-t-elle des crédits ?", a: "Non, l'IA Pro est illimitée pour les Pros Premium. Elle utilise Claude Sonnet 4.5 pour générer compte-rendus, synthèses, et aide diagnostique." },
  { q: "Combien de temps pour recevoir mes paiements ?", a: "Le virement Mobile Money est traité sous 24-48h ouvrées après votre demande de retrait." },
];

const FAQ_CENTRE: Faq[] = [
  { q: "Comment ajouter plus de 3 pros à mon centre ?", a: "Le compte gratuit limite à 3 pros. Souscrivez à Centre Premium pour des pros illimités." },
  { q: "Le tableau de bord est-il en temps réel ?", a: "Oui, les stats sont calculées en direct à chaque ouverture du tableau de bord. Aucune mise en cache." },
  { q: "L'export CSV est-il compatible avec mon logiciel comptable ?", a: "Oui, le CSV utilise le séparateur ';' (semicolon) et l'encodage UTF-8 BOM, compatible avec Excel, Sage, Ciel, et la plupart des logiciels comptables." },
  { q: "Puis-je partager le tableau de bord avec mon comptable ?", a: "Vous pouvez exporter en JSON pour une intégration API, ou exporter en CSV puis le transmettre par email." },
];

export default function SupportPremium() {
  const router = useRouter();
  const { user } = useAuth();
  const isPro = user?.role === "professionnel";
  const isCentre = user?.role === "centre_sante";
  const isMaman = user?.role === "maman";
  const isPrem = !!(user?.premium && user?.premium_until && new Date(user.premium_until) > new Date());
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const tutos = isMaman ? TUTOS_MAMAN : (isCentre ? TUTOS_CENTRE : TUTOS_PRO);
  const faqs = isMaman ? FAQ_MAMAN : (isCentre ? FAQ_CENTRE : FAQ_PRO);
  const roleLabel = isMaman ? "Maman" : (isCentre ? "Centre" : "Pro");

  const emailSupport = () => {
    const subject = encodeURIComponent(`[${roleLabel} Premium] Demande de support`);
    const body = encodeURIComponent(`Bonjour,\n\nJe rencontre la situation suivante :\n\n[Décrivez votre besoin]\n\nMerci.\n\n---\nUtilisateur : ${user?.name || ""}\nEmail : ${user?.email || ""}`);
    Linking.openURL(`mailto:infos@e-medicare.co?subject=${subject}&body=${body}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#7C3AED", "#5B21B6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Support Premium 💎</Text>
          <Text style={styles.sub}>FAQ · Tutoriels · Contact prioritaire</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {/* Statut Premium */}
        {isPrem ? (
          <View style={[styles.statusCard, { backgroundColor: "#D1FAE5" }]}>
            <Ionicons name="star" size={22} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: "#065F46" }]}>Vous êtes Premium ✨</Text>
              <Text style={styles.statusSub}>Support prioritaire 7j/7 actif</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.statusCard, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="information-circle" size={22} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: "#92400E" }]}>Compte gratuit</Text>
              <Text style={styles.statusSub}>Le support prioritaire est réservé aux Premium.</Text>
            </View>
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push("/premium")}>
              <Text style={styles.upgradeText}>Passer Premium</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Contact prioritaire */}
        <Text style={styles.section}>Contact prioritaire</Text>
        <TouchableOpacity style={[styles.contactBtn, styles.contactBtnFull, { backgroundColor: "#A855F7" }]} onPress={emailSupport}>
          <Ionicons name="mail" size={22} color="#fff" />
          <Text style={styles.contactText}>Écrire au support</Text>
        </TouchableOpacity>
        <Text style={styles.contactNote}>📧 infos@e-medicare.co · Réponse prioritaire sous 2h en heures ouvrées</Text>

        {/* Formation en ligne */}
        <Text style={styles.section}>📚 Formation en ligne</Text>
        <Text style={styles.sectionSub}>Tutoriels vidéo pour maîtriser tous les outils {isCentre ? "Centre" : "Pro"} Premium</Text>
        {tutos.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.tutoCard}
            onPress={() => Alert.alert("Tutoriel 🎬", `« ${t.title} »\n\nDurée : ${t.duration}\n\nLes vidéos seront disponibles dans la prochaine mise à jour. Pour un accompagnement immédiat, contactez le support prioritaire.`)}
          >
            <View style={[styles.tutoIcon, { backgroundColor: t.color + "20" }]}>
              <Ionicons name={t.icon} size={22} color={t.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tutoTitle}>{t.title}</Text>
              <Text style={styles.tutoMeta}>⏱️ {t.duration} · 🎯 {t.topic}</Text>
            </View>
            <Ionicons name="play-circle" size={26} color={t.color} />
          </TouchableOpacity>
        ))}

        {/* FAQ */}
        <Text style={styles.section}>❓ Questions fréquentes</Text>
        {faqs.map((f, i) => (
          <View key={i} style={styles.faqCard}>
            <TouchableOpacity onPress={() => setOpenFaq(openFaq === `${i}` ? null : `${i}`)} style={styles.faqHead}>
              <Text style={styles.faqQ}>{f.q}</Text>
              <Ionicons name={openFaq === `${i}` ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {openFaq === `${i}` && <Text style={styles.faqA}>{f.a}</Text>}
          </View>
        ))}

        <Text style={styles.disclaimer}>
          💡 Pour toute question complexe ou demande de formation personnalisée, écrivez-nous à <Text style={{ fontWeight: "800" }}>infos@e-medicare.co</Text> — réponse en moins de 2h en heures ouvrées.
        </Text>
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

  statusCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: RADIUS.md, marginBottom: 16 },
  statusTitle: { fontSize: 14, fontWeight: "800" },
  statusSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  upgradeBtn: { backgroundColor: "#F59E0B", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  upgradeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  section: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6, marginTop: 16 },
  sectionSub: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 },

  contactRow: { flexDirection: "row", gap: 8 },
  contactBtn: { flex: 1, alignItems: "center", justifyContent: "center", padding: 14, borderRadius: RADIUS.md, gap: 4, ...SHADOW },
  contactBtnFull: { flexDirection: "row", flex: 0, alignSelf: "stretch", gap: 8 },
  contactText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  contactNote: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 8, fontStyle: "italic" },

  tutoCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  tutoIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  tutoTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  tutoMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  faqCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, overflow: "hidden" },
  faqHead: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  faqQ: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },
  faqA: { fontSize: 12, color: COLORS.textSecondary, padding: 12, paddingTop: 0, lineHeight: 18 },

  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 20, lineHeight: 16, paddingHorizontal: 12 },
});
