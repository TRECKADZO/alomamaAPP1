/**
 * Écran Pro — Consulter le dossier d'une patiente par CMU ou code AM
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

export default function ConsulterPatient() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingDemande, setPendingDemande] = useState<any>(null);
  const [mesDemandes, setMesDemandes] = useState<any[]>([]);

  const loadDemandes = async () => {
    try {
      const r = await api.get("/pro/demandes/mes-demandes");
      setMesDemandes(r.data || []);
    } catch {}
  };
  useFocusEffect(useCallback(() => { loadDemandes(); const t = setInterval(loadDemandes, 5000); return () => clearInterval(t); }, []));

  const submit = async () => {
    const idClean = identifier.trim().toUpperCase().replace(/\s/g, "");
    if (!idClean) return Alert.alert("Identifiant requis", "Saisissez un N° CMU ou un code AM-XXXX-XX");
    setLoading(true);
    try {
      const r = await api.post("/pro/patient/recherche", { identifier: idClean, motif: motif.trim() || undefined });
      setPendingDemande(r.data);
      setIdentifier(""); setMotif("");
      Alert.alert("✅ Demande envoyée", r.data?.message || "La patiente va recevoir une notification pour valider.");
      loadDemandes();
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally { setLoading(false); }
  };

  const openDossier = (d: any) => {
    if (d.status !== "validated") return;
    router.push({ pathname: "/pro/dossier-patient", params: { id: d.patient_id, type: d.patient_type, token: d.access_token, nom: d.patient_nom } });
  };

  const statusColor = (s: string) => ({ pending: "#F59E0B", validated: "#10B981", refused: "#EF4444", expired: "#6B7280" } as any)[s] || "#6B7280";
  const statusLabel = (s: string) => ({ pending: "⏳ En attente", validated: "✅ Accordé", refused: "❌ Refusé", expired: "⌛ Expiré" } as any)[s] || s;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Consulter un dossier</Text>
          <Text style={styles.sub}>Par N° CMU ou code À lo Maman</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        <LinearGradient colors={["#3B82F6", "#06B6D4"]} style={styles.heroCard}>
          <Ionicons name="shield-checkmark" size={28} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Accès sécurisé</Text>
            <Text style={styles.heroDesc}>La patiente recevra une notification pour autoriser l'accès. Durée par défaut : 2 h.</Text>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Demander un accès</Text>
        <View style={styles.card}>
          <Text style={styles.label}>N° CMU (12 chiffres) OU Code AM-XXXX-XX</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Ex: 225000000001  ou  AM-X7K9-P3"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={styles.label}>Motif de consultation (facultatif)</Text>
          <TextInput
            style={[styles.input, { height: 70 }]}
            value={motif}
            onChangeText={setMotif}
            placeholder="Ex: Suivi grossesse 3e trimestre"
            placeholderTextColor={COLORS.textMuted}
            multiline
          />
          <TouchableOpacity onPress={submit} disabled={loading} style={{ marginTop: 12 }}>
            <LinearGradient colors={["#3B82F6", "#2563EB"]} style={styles.submitBtn}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="search" size={18} color="#fff" /><Text style={styles.submitText}>Rechercher et demander</Text></>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Mes demandes récentes</Text>
        {mesDemandes.length === 0 ? (
          <Text style={styles.empty}>Aucune demande pour le moment.</Text>
        ) : mesDemandes.map((d) => (
          <TouchableOpacity key={d.id} style={styles.demandeCard} onPress={() => openDossier(d)} activeOpacity={d.status === "validated" ? 0.7 : 1}>
            <View style={[styles.demandeBadge, { backgroundColor: statusColor(d.status) }]}>
              <Text style={styles.demandeBadgeText}>{statusLabel(d.status)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.demandeName}>{d.patient_nom}</Text>
              <Text style={styles.demandeMeta}>{d.patient_type === "enfant" ? "👶 Enfant" : "👩 Patiente"} · {d.via === "cmu" ? "CMU" : "Code AM"}</Text>
              {d.motif && <Text style={styles.demandeMotif} numberOfLines={1}>📋 {d.motif}</Text>}
            </View>
            {d.status === "validated" && <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  heroCard: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: RADIUS.lg, marginBottom: 16 },
  heroTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  heroDesc: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 4, lineHeight: 17 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 6, marginBottom: 10 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, marginTop: 10, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary, letterSpacing: 1 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  empty: { textAlign: "center", color: COLORS.textMuted, fontStyle: "italic", padding: 16 },
  demandeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  demandeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  demandeBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  demandeName: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  demandeMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  demandeMotif: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, fontStyle: "italic" },
});
