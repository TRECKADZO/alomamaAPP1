/**
 * Écran Maman — Mon code de partage + demandes reçues
 */
import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

export default function PartageDossier() {
  const router = useRouter();
  const [mine, setMine] = useState<any>(null);
  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        api.get("/auth/me/code-partage").then((r) => r.data),
        api.get("/partage/demandes-recues").then((r) => r.data).catch(() => []),
      ]);
      setMine(a);
      setDemandes(b);
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []));

  const valider = async (id: string) => {
    try {
      const r = await api.post(`/partage/demande/${id}/valider`);
      Alert.alert("✅ Accès accordé", r.data?.message || "Le professionnel peut consulter votre dossier.");
      load();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
  };
  const refuser = async (id: string) => {
    Alert.alert("Refuser l'accès ?", "Le pro ne pourra pas consulter votre dossier.", [
      { text: "Annuler", style: "cancel" },
      { text: "Refuser", style: "destructive", onPress: async () => {
        try { await api.post(`/partage/demande/${id}/refuser`); load(); } catch (e) { Alert.alert("Erreur", formatError(e)); }
      } },
    ]);
  };
  const shareCode = async () => {
    if (!mine) return;
    const code = mine.preferred || mine.code_provisoire;
    try { await Share.share({ message: `Mon code de partage À lo Maman : ${code}\n\n(À communiquer uniquement au personnel médical)` }); } catch {}
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const hasCmu = !!mine?.cmu;
  const displayCode = mine?.preferred || mine?.code_provisoire || "—";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Partage de mon dossier</Text>
          <Text style={styles.sub}>Accès sécurisé pour les pros</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
        {/* Code carte */}
        <LinearGradient colors={hasCmu ? ["#16A34A", "#22C55E"] : ["#F59E0B", "#FBBF24"]} style={styles.codeCard}>
          <Text style={styles.codeLabel}>{hasCmu ? "🏥 Mon Numéro CMU" : "🔐 Mon code À lo Maman"}</Text>
          <Text style={styles.codeValue}>{displayCode}</Text>
          {!hasCmu && <Text style={styles.codeHint}>Code provisoire — remplacé automatiquement dès que vous renseignez votre CMU.</Text>}
          <TouchableOpacity onPress={shareCode} style={styles.shareBtn}>
            <Ionicons name="share-social" size={16} color="#fff" />
            <Text style={styles.shareBtnText}>Partager</Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color="#0E7490" />
          <Text style={styles.infoText}>
            Communiquez ce code à votre médecin, sage-femme, infirmier·ère. Vous recevrez une <Text style={{ fontWeight: "800" }}>notification</Text> pour autoriser l'accès à chaque consultation. Accès valable {""}
            <Text style={{ fontWeight: "800" }}>2 heures</Text>.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>📬 Demandes d'accès</Text>
        {demandes.length === 0 ? (
          <Text style={styles.empty}>Aucune demande.</Text>
        ) : demandes.map((d) => {
          const isPending = d.status === "pending";
          return (
            <View key={d.id} style={[styles.demandeCard, isPending && { borderColor: "#F59E0B", borderWidth: 2 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.demandeProName}>👨‍⚕️ Dr {d.pro_name}</Text>
                {d.pro_specialite && <Text style={styles.demandeMeta}>{d.pro_specialite}</Text>}
                <Text style={styles.demandeMeta}>Pour : {d.patient_nom}</Text>
                {d.motif && <Text style={styles.demandeMotif}>📋 {d.motif}</Text>}
                <Text style={styles.demandeMeta}>Status : <Text style={{ fontWeight: "800", color: isPending ? "#F59E0B" : d.status === "validated" ? "#10B981" : "#EF4444" }}>{d.status}</Text></Text>
              </View>
              {isPending && (
                <View style={{ gap: 6 }}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => valider(d.id)}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.actionText}>Autoriser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => refuser(d.id)}>
                    <Ionicons name="close" size={20} color="#fff" />
                    <Text style={styles.actionText}>Refuser</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  codeCard: { padding: 20, borderRadius: RADIUS.lg, alignItems: "center", ...SHADOW },
  codeLabel: { color: "#fff", fontSize: 13, fontWeight: "700", opacity: 0.95 },
  codeValue: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: 3, marginTop: 8 },
  codeHint: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 8, textAlign: "center", lineHeight: 16 },
  shareBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginTop: 12 },
  shareBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  infoCard: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#CFFAFE", borderRadius: RADIUS.md, marginTop: 14, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, color: "#0E7490", lineHeight: 17 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 18, marginBottom: 10 },
  empty: { textAlign: "center", color: COLORS.textMuted, fontStyle: "italic", padding: 16 },

  demandeCard: { flexDirection: "row", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  demandeProName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  demandeMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  demandeMotif: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontStyle: "italic" },

  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minWidth: 100 },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
