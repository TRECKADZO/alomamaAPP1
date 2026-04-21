import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import axios from "axios";
import Constants from "expo-constants";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const API_BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  "";

type Plan = {
  code: string;
  label: string;
  base_price_fcfa: number;
  color: string;
  icon: any;
  description: string;
  features: string[];
  free_limits: string;
};

export default function PlansPublic() {
  const router = useRouter();
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/plans`);
        setPlans(data.plans || {});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const order = ["maman", "famille", "professionnel", "centre_sante"];
  const ordered = order.map((k) => plans[k]).filter(Boolean);
  const isWide = Platform.OS === "web";

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* TopBar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.push("/")} style={styles.logoRow}>
            <View style={styles.logoBadge}><Text style={styles.logoEmoji}>🌸</Text></View>
            <View>
              <Text style={styles.brand}>À lo Maman</Text>
              <Text style={styles.tagline}>Nos offres</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/portail-pro")} style={styles.proBtn}>
            <Ionicons name="log-in-outline" size={16} color="#fff" />
            <Text style={styles.proBtnText}>Connexion</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Des offres pour chaque besoin</Text>
          <Text style={styles.heroSub}>
            Une plateforme, 4 expériences : mamans, familles, professionnels de santé et centres de santé.
            Choisissez le plan qui vous correspond, à partir de 1 500 FCFA/mois.
          </Text>
        </View>

        {/* Grid */}
        <View style={[styles.grid, isWide && { flexDirection: "row", flexWrap: "wrap" }]}>
          {ordered.map((p) => (
            <PlanCard key={p.code} plan={p} onChoose={() => router.push("/portail-pro")} />
          ))}
        </View>

        {/* Discounts */}
        <View style={styles.discountBox}>
          <Ionicons name="pricetags" size={22} color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.discountTitle}>Réductions automatiques sur la durée</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <View style={styles.chip}><Text style={styles.chipText}>1 mois · plein tarif</Text></View>
              <View style={[styles.chip, { backgroundColor: "#FCE7F3" }]}><Text style={[styles.chipText, { color: "#BE185D" }]}>3 mois · -5%</Text></View>
              <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}><Text style={[styles.chipText, { color: "#1D4ED8" }]}>6 mois · -10%</Text></View>
              <View style={[styles.chip, { backgroundColor: "#DCFCE7" }]}><Text style={[styles.chipText, { color: "#166534" }]}>12 mois · -20%</Text></View>
            </View>
          </View>
        </View>

        {/* FAQ-lite */}
        <Text style={styles.faqTitle}>Questions fréquentes</Text>
        <Faq q="Puis-je changer d'offre ?" a="Oui. À tout moment depuis votre compte, les prorata sont appliqués." />
        <Faq q="Quels moyens de paiement ?" a="PayDunya : Orange Money, MTN MoMo, Wave, Moov, Free Money, carte Visa/Mastercard." />
        <Faq q="Est-ce que la maman peut utiliser l'app gratuitement ?" a="Oui, avec des limites : 2 enfants max, 10 RDV par mois et IA basique. Passage Premium à tout moment." />
        <Faq q="Les données sont-elles sécurisées ?" a="Oui, elles sont chiffrées et stockées sur une infrastructure conforme aux standards HL7/FHIR." />

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 À lo Maman · Côte d'Ivoire</Text>
          <Text style={styles.footerText}>support@alomaman.com</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({ plan, onChoose }: { plan: Plan; onChoose: () => void }) {
  const gradient: [string, string] = (() => {
    switch (plan.code) {
      case "pro": return ["#0EA5E9", "#0369A1"];
      case "centre": return ["#A855F7", "#7C3AED"];
      case "famille": return ["#14B8A6", "#0F766E"];
      default: return ["#EC4899", "#BE185D"];
    }
  })();

  return (
    <View style={styles.card}>
      <LinearGradient colors={gradient} style={styles.cardHead}>
        <Ionicons name={plan.icon} size={28} color="#fff" />
        <Text style={styles.cardLabel}>{plan.label}</Text>
        <Text style={styles.cardDesc} numberOfLines={3}>{plan.description}</Text>
        <Text style={styles.cardPrice}>{plan.base_price_fcfa.toLocaleString()} <Text style={styles.cardPriceUnit}>FCFA/mois</Text></Text>
      </LinearGradient>

      <View style={styles.cardBody}>
        {plan.features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={16} color={plan.color} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
        <View style={styles.freeBox}>
          <Ionicons name="information-circle-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.freeText}>{plan.free_limits}</Text>
        </View>
        <TouchableOpacity style={[styles.chooseBtn, { backgroundColor: plan.color }]} onPress={onChoose}>
          <Text style={styles.chooseText}>Choisir ce plan</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <View style={styles.faq}>
      <Text style={styles.faqQ}>{q}</Text>
      <Text style={styles.faqA}>{a}</Text>
    </View>
  );
}

const isWeb = Platform.OS === "web";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { flexGrow: 1, paddingBottom: 40 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  logoEmoji: { fontSize: 22 },
  brand: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  tagline: { fontSize: 11, color: COLORS.primary, fontWeight: "700", textTransform: "uppercase" },
  proBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.primary },
  proBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  hero: { paddingVertical: 36, paddingHorizontal: 24, alignItems: "center", maxWidth: 720, alignSelf: "center" },
  heroTitle: { fontSize: 30, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  heroSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", marginTop: 12, lineHeight: 20 },

  grid: { paddingHorizontal: 16, gap: 16, maxWidth: 1280, alignSelf: "center", width: "100%" },
  card: { flexBasis: isWeb ? "23%" : "100%", flexGrow: 1, minWidth: 260, backgroundColor: COLORS.surface, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, ...SHADOW.md },
  cardHead: { padding: 20, gap: 6 },
  cardLabel: { fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 4 },
  cardDesc: { fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 18 },
  cardPrice: { fontSize: 26, fontWeight: "800", color: "#fff", marginTop: 6 },
  cardPriceUnit: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
  cardBody: { padding: 18 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  featureText: { flex: 1, fontSize: 12, color: COLORS.textPrimary, lineHeight: 17 },
  freeBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10, padding: 10, backgroundColor: COLORS.bgPrimary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  freeText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },
  chooseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 999, marginTop: 14 },
  chooseText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  discountBox: { flexDirection: "row", gap: 12, marginTop: 28, marginHorizontal: 16, padding: 16, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, maxWidth: 900, alignSelf: "center", width: "100%" },
  discountTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#fff" },
  chipText: { fontSize: 11, fontWeight: "800", color: COLORS.textPrimary },

  faqTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center", marginTop: 36 },
  faq: { marginHorizontal: 16, marginTop: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, maxWidth: 900, alignSelf: "center", width: "100%" },
  faqQ: { fontWeight: "800", fontSize: 14, color: COLORS.textPrimary },
  faqA: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },

  footer: { alignItems: "center", paddingVertical: 24, marginTop: 30, borderTopWidth: 1, borderTopColor: COLORS.border },
  footerText: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
