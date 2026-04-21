import { useRouter } from "expo-router";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const MODULES = [
  { id: "dossier", label: "Dossier médical", sub: "Vue synthétique", icon: "document-text", colors: ["#14B8A6", "#06B6D4"], path: "/dossier-medical" },
  { id: "grossesse", label: "Grossesse", sub: "Suivi par semaine", icon: "heart", colors: ["#F472B6", "#FB7185"], path: "/(tabs)/grossesse" },
  { id: "enfants", label: "Mes enfants", sub: "Carnets de santé", icon: "happy", colors: ["#3B82F6", "#06B6D4"], path: "/(tabs)/enfants" },
  { id: "rdv", label: "Rendez-vous", sub: "Calendrier", icon: "calendar", colors: ["#A855F7", "#6366F1"], path: "/(tabs)/rdv" },
  { id: "cycle", label: "Cycle menstruel", sub: "Ovulation, règles", icon: "flower", colors: ["#E11D48", "#F43F5E"], path: "/cycle" },
  { id: "contraception", label: "Contraception", sub: "Suivi méthode", icon: "shield-checkmark", colors: ["#F59E0B", "#EA580C"], path: "/contraception" },
  { id: "postpartum", label: "Post-partum", sub: "Suivi bébé + maman", icon: "heart-circle", colors: ["#06B6D4", "#3B82F6"], path: "/post-partum" },
  { id: "sommeil", label: "Sommeil", sub: "Qualité + heures", icon: "moon", colors: ["#6366F1", "#8B5CF6"], path: "/sommeil" },
  { id: "agenda", label: "Agenda", sub: "Tous mes rappels", icon: "calendar-outline", colors: ["#F59E0B", "#EF4444"], path: "/agenda" },
  { id: "documents", label: "Documents", sub: "Analyses, ordonnances", icon: "folder", colors: ["#14B8A6", "#06B6D4"], path: "/documents" },
  { id: "questions", label: "Questions spécialistes", sub: "Demander à un pro", icon: "help-circle", colors: ["#10B981", "#14B8A6"], path: "/questions" },
  { id: "famille", label: "Famille connectée", sub: "Partager avec mes proches", icon: "people-circle", colors: ["#F59E0B", "#EF4444"], path: "/famille" },
  { id: "centres", label: "Centres de santé", sub: "Annuaire PMI, cliniques", icon: "business", colors: ["#A855F7", "#6366F1"], path: "/centres" },
  { id: "naissance", label: "Déclaration naissance", sub: "Acte de naissance", icon: "document", colors: ["#F472B6", "#A855F7"], path: "/naissance" },
  { id: "tele", label: "Télé-échographie", sub: "Consultation à distance", icon: "scan", colors: ["#8B5CF6", "#A855F7"], path: "/tele-echo" },
];

export default function MonEspaceSante() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#F472B6", "#A855F7"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mon espace santé</Text>
          <Text style={styles.sub}>Tous vos outils en un endroit</Text>
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <View style={styles.grid}>
          {MODULES.map((m) => (
            <TouchableOpacity key={m.id} onPress={() => router.push(m.path as any)} style={styles.tile}>
              <LinearGradient colors={m.colors as [string, string]} style={styles.tileIcon}>
                <Ionicons name={m.icon as any} size={24} color="#fff" />
              </LinearGradient>
              <Text style={styles.tileLabel}>{m.label}</Text>
              <Text style={styles.tileSub}>{m.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  tileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  tileLabel: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14 },
  tileSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
});
