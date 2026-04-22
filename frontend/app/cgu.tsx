import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function CGU() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>CGU — Conditions Générales</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        <Text style={styles.h1}>À lo Maman — Conditions Générales d'Utilisation</Text>
        <Text style={styles.version}>Version 1.0 · Février 2026</Text>

        <Text style={styles.h2}>1. Objet</Text>
        <Text style={styles.p}>
          L'application « À lo Maman » (ci-après « l'Application ») est une plateforme numérique de santé maternelle et pédiatrique destinée aux mamans, professionnels de santé, centres de santé et proches familiaux, principalement en Côte d'Ivoire.
        </Text>

        <Text style={styles.h2}>2. Acceptation des conditions</Text>
        <Text style={styles.p}>
          L'utilisation de l'Application implique l'acceptation pleine et entière des présentes CGU. Si vous n'acceptez pas ces conditions, merci de ne pas créer de compte.
        </Text>

        <Text style={styles.h2}>3. Création de compte</Text>
        <Text style={styles.p}>
          L'inscription est gratuite. Les informations fournies doivent être exactes. L'utilisateur s'engage à garder ses identifiants confidentiels.
        </Text>

        <Text style={styles.h2}>4. Nature des services</Text>
        <Text style={styles.p}>
          L'Application propose : suivi de grossesse, carnet de santé enfant, téléconsultation, prise de rendez-vous, CMU, communauté, ressources éducatives validées OMS/UNICEF/MSHP-CI. 
          {"\n\n"}⚠️ **L'Application ne remplace pas une consultation médicale**. En cas d'urgence, contactez le 144 (SAMU Côte d'Ivoire).
        </Text>

        <Text style={styles.h2}>5. Abonnements Premium</Text>
        <Text style={styles.p}>
          Des fonctionnalités avancées sont disponibles via abonnement Premium (Maman, Pro, Centre, Famille). Les paiements sont traités par PayDunya (Orange Money, MTN MoMo, Wave, Visa/Mastercard).
        </Text>

        <Text style={styles.h2}>6. Obligations de l'utilisateur</Text>
        <Text style={styles.p}>
          • Ne pas publier de contenus illégaux, diffamatoires ou violents
          {"\n"}• Respecter la vie privée des autres utilisateurs
          {"\n"}• Ne pas usurper l'identité d'un professionnel de santé
          {"\n"}• Ne pas utiliser l'Application à des fins commerciales sans autorisation
        </Text>

        <Text style={styles.h2}>7. Responsabilité</Text>
        <Text style={styles.p}>
          À lo Maman met tout en œuvre pour assurer la disponibilité du service mais ne peut garantir une disponibilité à 100%. Les informations fournies par les professionnels sur la plateforme relèvent de leur responsabilité individuelle.
        </Text>

        <Text style={styles.h2}>8. Résiliation</Text>
        <Text style={styles.p}>
          L'utilisateur peut supprimer son compte à tout moment depuis son profil. Toute violation des présentes peut entraîner une suspension immédiate.
        </Text>

        <Text style={styles.h2}>9. Droit applicable</Text>
        <Text style={styles.p}>
          Les présentes CGU sont régies par le droit ivoirien. Tout litige sera porté devant les tribunaux compétents d'Abidjan.
        </Text>

        <Text style={styles.h2}>10. Contact</Text>
        <Text style={styles.p}>Pour toute question : support@alomaman.ci</Text>
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
