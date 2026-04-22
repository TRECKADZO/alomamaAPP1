import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Privacy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Politique de Confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <Text style={styles.h1}>Politique de Confidentialité</Text>
        <Text style={styles.version}>Version 1.0 · Février 2026</Text>

        <Text style={styles.h2}>1. Données que nous collectons</Text>
        <Text style={styles.p}>
          • **Identification** : nom, email, téléphone, rôle (maman/pro/centre/famille)
          {"\n"}• **Données de santé** (si vous êtes maman) : grossesse, enfants, vaccins, mesures, CMU
          {"\n"}• **Données d'usage** : rendez-vous, messages, posts communauté, préférences
          {"\n"}• **Données de paiement** : gérées par PayDunya (nous ne stockons AUCUNE donnée bancaire)
        </Text>

        <Text style={styles.h2}>2. Finalités du traitement</Text>
        <Text style={styles.p}>
          • Fournir les services de suivi maternel et pédiatrique
          {"\n"}• Permettre les consultations avec les professionnels
          {"\n"}• Calculer les prises en charge CMU
          {"\n"}• Améliorer l'application (analytics anonymisés)
          {"\n"}• Respecter nos obligations légales
        </Text>

        <Text style={styles.h2}>3. Base légale</Text>
        <Text style={styles.p}>
          Vos données sont traitées sur la base de votre **consentement explicite** (coché lors de l'inscription) et de l'exécution du contrat de service. Les données de santé bénéficient d'une protection renforcée conformément à la loi ivoirienne n°2013-450 sur la protection des données personnelles.
        </Text>

        <Text style={styles.h2}>4. Destinataires</Text>
        <Text style={styles.p}>
          • **Les professionnels que vous consultez** (accès limité à votre dossier uniquement pendant le RDV)
          {"\n"}• **Vos proches famille** (seulement avec permissions granulaires que vous accordez)
          {"\n"}• **PayDunya** pour les paiements
          {"\n"}• **Hébergeur cloud** pour stocker les données (serveurs sécurisés)
          {"\n"}• **Autorités légales** sur demande judiciaire
        </Text>

        <Text style={styles.h2}>5. Durée de conservation</Text>
        <Text style={styles.p}>
          • Données de compte : tant que votre compte est actif
          {"\n"}• Données médicales : 20 ans (conformément aux obligations de conservation des dossiers médicaux)
          {"\n"}• Paiements : 10 ans (obligations comptables)
          {"\n"}• Après suppression : anonymisation sous 30 jours
        </Text>

        <Text style={styles.h2}>6. Vos droits</Text>
        <Text style={styles.p}>
          Vous disposez des droits suivants :
          {"\n"}• **Accès** : consulter vos données (dossier médical téléchargeable en PDF)
          {"\n"}• **Rectification** : corriger toute information inexacte
          {"\n"}• **Effacement** : supprimer votre compte depuis votre profil
          {"\n"}• **Portabilité** : exporter vos données au format JSON/FHIR
          {"\n"}• **Opposition** : révoquer les partages familiaux à tout moment
          {"\n"}• **Retrait consentement** : supprimer votre compte si vous ne souhaitez plus être traité
        </Text>

        <Text style={styles.h2}>7. Sécurité</Text>
        <Text style={styles.p}>
          • **Transport** : HTTPS/TLS 1.3 pour toutes les communications
          {"\n"}• **Authentification** : mots de passe hachés (bcrypt), JWT sécurisés
          {"\n"}• **Accès médical** : strictement limité au Pro/Centre consulté
          {"\n"}• **Partages** : liens expirables (7 jours)
          {"\n"}• **Audit** : journalisation des accès sensibles
        </Text>

        <Text style={styles.h2}>8. Mineurs</Text>
        <Text style={styles.p}>
          Les données des enfants ne sont gérées que par leur maman/papa (titulaire de l'autorité parentale). Aucune inscription directe pour les mineurs.
        </Text>

        <Text style={styles.h2}>9. Contact & Réclamations</Text>
        <Text style={styles.p}>
          DPO (Délégué Protection Données) : dpo@alomaman.ci
          {"\n"}Vous pouvez également saisir l'Autorité de Régulation des Télécommunications de Côte d'Ivoire (ARTCI).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary },
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  version: { fontSize: 11, color: COLORS.textMuted, marginBottom: 18 },
  h2: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 18, marginBottom: 8 },
  p: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
});
