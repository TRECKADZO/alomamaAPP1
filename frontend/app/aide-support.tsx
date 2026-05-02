import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, Alert, Platform, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

interface FAQItem {
  q: string;
  a: string;
  cat: string;
}

const FAQS: FAQItem[] = [
  {
    cat: "🩺 Téléconsultation",
    q: "Comment démarrer une téléconsultation vidéo ?",
    a: "Allez dans l'onglet « RDV », ouvrez votre rendez-vous en mode téléconsultation, puis tapez « Rejoindre la salle ». La salle s'ouvre 15 min avant l'heure du RDV.",
  },
  {
    cat: "🩺 Téléconsultation",
    q: "Pourquoi je ne reçois pas la sonnerie quand mon Pro m'appelle ?",
    a: "Vérifiez : 1) que vous avez accepté les notifications dans Profil → Paramètres ; 2) que vous êtes connecté(e) à internet ; 3) que vous utilisez la dernière version de l'app installée depuis Google Play.",
  },
  {
    cat: "📅 Rendez-vous",
    q: "Comment prendre un rendez-vous avec un professionnel ?",
    a: "Tapez « Trouver un Pro » sur l'accueil, choisissez votre praticien, sélectionnez date et heure, indiquez le motif puis confirmez. Vous serez notifié(e) dès que le Pro confirme.",
  },
  {
    cat: "📅 Rendez-vous",
    q: "Comment annuler un rendez-vous ?",
    a: "Ouvrez le RDV concerné dans l'onglet « RDV », puis tapez « Annuler ». Une notification sera automatiquement envoyée au Pro.",
  },
  {
    cat: "👶 Carnet enfant",
    q: "Comment enregistrer le poids ou la taille de mon enfant ?",
    a: "Allez dans Profil → Carnets de santé → Choisissez l'enfant → « Voir les courbes » → bouton « + Ajouter une mesure ». Les courbes OMS s'actualisent automatiquement.",
  },
  {
    cat: "👶 Carnet enfant",
    q: "Comment ajouter un vaccin ?",
    a: "Profil → Carnets de santé → ouvrez le carnet de l'enfant → onglet « Vaccins » → « + Ajouter un vaccin ». Saisissez le nom, la date, le lot.",
  },
  {
    cat: "🤰 Suivi grossesse",
    q: "Comment activer le suivi de ma grossesse ?",
    a: "Profil → Suivi grossesse → renseignez la date de vos dernières règles. L'app calcule automatiquement votre semaine d'aménorrhée et la date prévue d'accouchement.",
  },
  {
    cat: "🔐 CMU & Partage",
    q: "Comment partager mon dossier avec un médecin ?",
    a: "Dans Profil → Partage sécurisé, présentez votre code AM ou QR code au Pro. Il pourra accéder à votre dossier de manière temporaire (durée que vous définissez) après votre validation.",
  },
  {
    cat: "🔐 CMU & Partage",
    q: "Que faire si je n'ai pas encore de CMU ?",
    a: "L'app vous attribue un code AM provisoire (8 caractères). Vous pouvez l'utiliser pour partager votre dossier en attendant votre attestation CMU officielle.",
  },
  {
    cat: "💳 Premium",
    q: "Comment activer mon abonnement Premium ?",
    a: "Profil → Premium → choisissez votre formule → payez via Mobile Money (PayDunya). Vos avantages sont activés instantanément après le paiement.",
  },
  {
    cat: "🔔 Notifications",
    q: "Je ne reçois aucune notification, que faire ?",
    a: "1) Allez dans Profil → Paramètres → Notifications et vérifiez que c'est activé. 2) Dans les paramètres Android : Apps → À lo Maman → Notifications → activez tout. 3) Rouvrez l'app et tapez « Tester une notification push ».",
  },
  {
    cat: "🔔 Notifications",
    q: "Comment désactiver les rappels ?",
    a: "Profil → Mes rappels → ouvrez le rappel → désactivez le toggle. Pour désactiver toutes les notifications, allez dans les paramètres Android.",
  },
];

const CATEGORIES = Array.from(new Set(FAQS.map((f) => f.cat)));

export default function AideSupport() {
  const router = useRouter();
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = search.trim()
    ? FAQS.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
    : FAQS;

  const sendContact = async () => {
    if (!contactSubject.trim() || !contactMessage.trim()) {
      Alert.alert("Champs manquants", "Veuillez renseigner le sujet et le message.");
      return;
    }
    setSending(true);
    try {
      await api.post("/support/contact", {
        subject: contactSubject.trim(),
        message: contactMessage.trim(),
      });
      Alert.alert(
        "Message envoyé ✓",
        "Notre équipe vous répondra par email dans les 24h. Merci de votre confiance !",
        [{ text: "OK", onPress: () => { setContactSubject(""); setContactMessage(""); } }]
      );
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSending(false);
    }
  };

  const callSupport = () => {
    Linking.openURL("tel:+22507070707").catch(() => {});
  };
  const emailSupport = () => {
    Linking.openURL("mailto:support@alomaman.ci?subject=Aide À lo Maman").catch(() => {});
  };
  const whatsappSupport = () => {
    Linking.openURL("https://wa.me/22507070707?text=Bonjour, j'ai besoin d'aide avec l'app À lo Maman").catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Aide & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 60 }}>
          {/* Hero */}
          <LinearGradient colors={["#F4A754", "#D97843"]} style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="help-buoy" size={32} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Comment pouvons-nous vous aider ?</Text>
              <Text style={styles.heroSub}>Notre équipe répond sous 24h ouvrées</Text>
            </View>
          </LinearGradient>

          {/* Contact rapide */}
          <Text style={styles.sectionTitle}>Contact rapide</Text>
          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickCard} onPress={callSupport}>
              <View style={[styles.quickIcon, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="call" size={22} color="#10B981" />
              </View>
              <Text style={styles.quickLabel}>Appeler</Text>
              <Text style={styles.quickSub}>+225 07 07 07 07</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCard} onPress={whatsappSupport}>
              <View style={[styles.quickIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#16A34A" />
              </View>
              <Text style={styles.quickLabel}>WhatsApp</Text>
              <Text style={styles.quickSub}>Réponse rapide</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCard} onPress={emailSupport}>
              <View style={[styles.quickIcon, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="mail" size={22} color="#3B82F6" />
              </View>
              <Text style={styles.quickLabel}>Email</Text>
              <Text style={styles.quickSub}>support@alomaman.ci</Text>
            </TouchableOpacity>
          </View>

          {/* FAQ */}
          <Text style={styles.sectionTitle}>Questions fréquentes</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher dans la FAQ…"
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Aucune réponse ne correspond à votre recherche</Text>
              <Text style={styles.emptyHint}>Contactez-nous via le formulaire ci-dessous</Text>
            </View>
          ) : (
            CATEGORIES.map((cat) => {
              const items = filtered.filter((f) => f.cat === cat);
              if (items.length === 0) return null;
              return (
                <View key={cat} style={styles.faqSection}>
                  <Text style={styles.faqCat}>{cat}</Text>
                  {items.map((item) => {
                    const open = openQ === item.q;
                    return (
                      <TouchableOpacity
                        key={item.q}
                        style={[styles.faqItem, open && styles.faqItemOpen]}
                        onPress={() => setOpenQ(open ? null : item.q)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.faqQRow}>
                          <Text style={styles.faqQ}>{item.q}</Text>
                          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={COLORS.primary} />
                        </View>
                        {open && <Text style={styles.faqA}>{item.a}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })
          )}

          {/* Formulaire de contact */}
          <Text style={styles.sectionTitle}>Vous n'avez pas trouvé ?</Text>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Sujet</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Ex : Problème de connexion"
              placeholderTextColor={COLORS.textMuted}
              value={contactSubject}
              onChangeText={setContactSubject}
              maxLength={100}
            />
            <Text style={styles.formLabel}>Votre message</Text>
            <TextInput
              style={[styles.formInput, styles.formInputArea]}
              placeholder="Décrivez précisément votre problème ou question…"
              placeholderTextColor={COLORS.textMuted}
              value={contactMessage}
              onChangeText={setContactMessage}
              multiline
              numberOfLines={5}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={styles.formCounter}>{contactMessage.length}/1000</Text>
            <TouchableOpacity
              style={[styles.submitBtn, (sending || !contactSubject || !contactMessage) && { opacity: 0.5 }]}
              onPress={sendContact}
              disabled={sending || !contactSubject || !contactMessage}
            >
              <LinearGradient colors={["#F4A754", "#D97843"]} style={styles.submitBtnInner}>
                {sending ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>Envoyer</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Liens utiles */}
          <Text style={styles.sectionTitle}>Liens utiles</Text>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/cgu")}>
            <Ionicons name="document-text-outline" size={20} color={COLORS.primary} />
            <Text style={styles.linkText}>Conditions générales d'utilisation</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/privacy")}>
            <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
            <Text style={styles.linkText}>Politique de confidentialité</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/about" as any)}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.linkText}>À propos d'À lo Maman</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: RADIUS.lg, marginBottom: 16 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 4, fontWeight: "600" },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 18, marginBottom: 10 },

  quickRow: { flexDirection: "row", gap: 8 },
  quickCard: { flex: 1, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  quickIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  quickLabel: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13 },
  quickSub: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 6, color: COLORS.textPrimary, fontSize: 13 },

  empty: { alignItems: "center", padding: 24 },
  emptyText: { color: COLORS.textPrimary, fontWeight: "700", marginTop: 10 },
  emptyHint: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },

  faqSection: { marginBottom: 14 },
  faqCat: { fontSize: 12, fontWeight: "800", color: COLORS.primary, marginBottom: 6, textTransform: "uppercase" },
  faqItem: { padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  faqItemOpen: { borderColor: COLORS.primary, backgroundColor: "#FFF7EE" },
  faqQRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  faqQ: { flex: 1, color: COLORS.textPrimary, fontWeight: "700", fontSize: 13, lineHeight: 18 },
  faqA: { color: COLORS.textSecondary, fontSize: 12, marginTop: 8, lineHeight: 18 },

  formCard: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  formLabel: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12, marginTop: 10, marginBottom: 6 },
  formInput: { padding: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary, fontSize: 13 },
  formInputArea: { height: 100 },
  formCounter: { color: COLORS.textMuted, fontSize: 10, textAlign: "right", marginTop: 4 },
  submitBtn: { marginTop: 12, alignSelf: "stretch" },
  submitBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: RADIUS.pill },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  linkText: { flex: 1, color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
});
