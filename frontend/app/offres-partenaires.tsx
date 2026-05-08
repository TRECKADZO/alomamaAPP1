/**
 * Offres partenaires 🎁 — Pharmacies, crèches, boutiques, labos.
 * Réservé aux Mamans Premium.
 * Route: /offres-partenaires
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import PremiumGate from "../components/PremiumGate";

export default function OffresPartenaires() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [premiumBlocked, setPremiumBlocked] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    setPremiumBlocked(null);
    try {
      const r = await api.get("/partenaires/offres");
      setData(r.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        setPremiumBlocked(detail.message || "Réservé Maman Premium.");
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert("Copié ✅", `Code promo « ${code} » copié.`);
    } catch {
      Alert.alert("Erreur", "Impossible de copier le code.");
    }
  };

  const callPartenaire = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
  };

  const TYPES: { key: string; label: string; icon: any; color: string }[] = [
    { key: "all", label: "Tout", icon: "apps", color: "#EC4899" },
    { key: "pharmacie", label: "Pharmacies", icon: "medkit", color: "#10B981" },
    { key: "creche", label: "Crèches", icon: "happy", color: "#F59E0B" },
    { key: "boutique", label: "Boutiques", icon: "cart", color: "#3B82F6" },
    { key: "laboratoire", label: "Labos", icon: "flask", color: "#A855F7" },
  ];

  const filtered = data?.offres?.filter((o: any) => filter === "all" || o.type === filter) || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EC4899", "#BE185D"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Offres partenaires 🎁</Text>
          <Text style={styles.sub}>Réductions exclusives Maman Premium</Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : premiumBlocked ? (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          <PremiumGate
            message={premiumBlocked}
            color="#EC4899"
            ctaLabel="Devenir Maman Premium"
            benefits="Inclus avec Maman Premium : Offres partenaires · IA Claude illimitée · RDV illimités · 5 enfants · Support 24/7."
          />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {TYPES.map((t) => (
              <TouchableOpacity key={t.key} style={[styles.chip, filter === t.key && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setFilter(t.key)}>
                <Ionicons name={t.icon} size={14} color={filter === t.key ? "#fff" : t.color} />
                <Text style={[styles.chipText, filter === t.key && { color: "#fff" }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.count}>{filtered.length} offre(s) disponible(s)</Text>

          {filtered.map((o: any) => {
            const t = TYPES.find((x) => x.key === o.type);
            return (
              <View key={o.id} style={styles.card}>
                <View style={[styles.cardHead, { backgroundColor: (t?.color || "#EC4899") + "15" }]}>
                  <View style={[styles.iconBox, { backgroundColor: t?.color || "#EC4899" }]}>
                    <Ionicons name={t?.icon || "gift"} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{o.name}</Text>
                    <Text style={styles.cardCity}>📍 {o.ville}</Text>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.promoBox}>
                    <Ionicons name="pricetag" size={16} color="#EC4899" />
                    <Text style={styles.promoText}>{o.promo}</Text>
                  </View>
                  <View style={styles.codeRow}>
                    <View style={styles.codeBox}>
                      <Text style={styles.codeLabel}>Code promo</Text>
                      <Text style={styles.codeValue}>{o.code}</Text>
                    </View>
                    <TouchableOpacity style={styles.copyBtn} onPress={() => copyCode(o.code)}>
                      <Ionicons name="copy" size={14} color="#fff" />
                      <Text style={styles.copyText}>Copier</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => callPartenaire(o.phone)}>
                      <Ionicons name="call" size={14} color="#3B82F6" />
                      <Text style={styles.actionText}>{o.phone}</Text>
                    </TouchableOpacity>
                    <Text style={styles.validity}>Valide jusqu'au {o.valid_until}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          <Text style={styles.disclaimer}>
            💡 Présentez votre code promo en magasin ou à la commande pour bénéficier de la réduction. Les conditions peuvent varier selon les partenaires.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  count: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 12, textAlign: "center" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  cardCity: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  cardBody: { padding: 12, gap: 10 },
  promoBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: "#FCE7F3", borderRadius: 8 },
  promoText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#9F1239" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  codeBox: { flex: 1, padding: 10, backgroundColor: "#FAFAFA", borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed" as any },
  codeLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: "700", letterSpacing: 0.5 },
  codeValue: { fontSize: 16, fontWeight: "800", color: "#EC4899", letterSpacing: 1, marginTop: 2 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EC4899", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  copyText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cardActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 11, color: "#3B82F6", fontWeight: "700" },
  validity: { fontSize: 10, color: COLORS.textMuted },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 16, lineHeight: 16 },
});
