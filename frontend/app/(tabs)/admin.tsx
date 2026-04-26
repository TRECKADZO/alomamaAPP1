import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

type Overview = {
  generated_at: string;
  users: { total: number; new_30d: number; new_7d: number; growth_rate_30d: number; by_role: Record<string, number>; premium: number; cmu: number; premium_conversion_rate: number; cmu_adoption_rate: number };
  health: { total_grossesses: number; active_grossesses: number; total_enfants: number; total_centres: number };
  rdv: { total: number; last_30d: number; completed: number; teleconsultations: number; telecon_share: number };
  finance: { total_revenue_fcfa: number; revenue_30d_fcfa: number; transactions: number; avg_basket_fcfa: number };
};

const fmtFCFA = (n: number) =>
  n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

export default function AdminHub() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/admin/metrics/overview");
      setData(r.data);
    } catch (e) {
      console.warn("admin metrics overview", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
      >
        <Text style={styles.title}>Console Super Admin</Text>
        <Text style={styles.subtitle}>Tableau de bord stratégique · Données pour gouvernements, ministères, OMS, UNICEF</Text>

        {/* Hero KPI : Utilisateurs totaux */}
        <LinearGradient colors={["#0EA5E9", "#0369A1"]} style={styles.hero}>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroLabel}>Utilisateurs actifs</Text>
              <Text style={styles.heroValue}>{data?.users.total ?? 0}</Text>
              <Text style={styles.heroSub}>+{data?.users.new_30d ?? 0} ce mois · +{data?.users.new_7d ?? 0} cette semaine</Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="people" size={36} color="#fff" />
            </View>
          </View>
          <View style={styles.heroChips}>
            <Chip label={`${data?.users.by_role.maman ?? 0} mamans`} color="#fff" />
            <Chip label={`${data?.users.by_role.professionnel ?? 0} pros`} color="#fff" />
            <Chip label={`${data?.users.by_role.centre_sante ?? 0} centres`} color="#fff" />
          </View>
        </LinearGradient>

        {/* Cartes KPI principales */}
        <View style={styles.grid}>
          <KpiCard
            icon="heart"
            color="#EC4899"
            label="Grossesses suivies"
            value={data?.health.total_grossesses ?? 0}
            sub={`${data?.health.active_grossesses ?? 0} en cours`}
          />
          <KpiCard
            icon="happy"
            color="#10B981"
            label="Enfants suivis"
            value={data?.health.total_enfants ?? 0}
            sub="Vaccins · Croissance"
          />
          <KpiCard
            icon="calendar"
            color="#F59E0B"
            label="RDV"
            value={data?.rdv.total ?? 0}
            sub={`${data?.rdv.telecon_share ?? 0}% télémédecine`}
          />
          <KpiCard
            icon="cash"
            color="#059669"
            label="CA total"
            value={fmtFCFA(data?.finance.total_revenue_fcfa ?? 0)}
            sub={`${data?.finance.transactions ?? 0} transactions`}
            unit="FCFA"
          />
          <KpiCard
            icon="diamond"
            color="#8B5CF6"
            label="Premium"
            value={`${data?.users.premium_conversion_rate ?? 0}%`}
            sub={`${data?.users.premium ?? 0} abonnés`}
          />
          <KpiCard
            icon="medical"
            color="#0EA5E9"
            label="CMU"
            value={`${data?.users.cmu_adoption_rate ?? 0}%`}
            sub={`${data?.users.cmu ?? 0} bénéficiaires`}
          />
        </View>

        {/* Sections détaillées */}
        <Text style={styles.sectionTitle}>📊 Tableaux de bord détaillés</Text>

        <SectionCard
          icon="heart-circle"
          color="#EC4899"
          title="Santé maternelle"
          desc="Distribution âge des mères, trimestres, suivis prénataux, plans de naissance, alertes grossesses précoces"
          target="OMS · UNICEF · Ministère Santé"
          onPress={() => router.push("/admin/sante-maternelle")}
        />

        <SectionCard
          icon="happy-outline"
          color="#10B981"
          title="Santé infantile"
          desc="Couverture vaccinale, suivi croissance, allergies, naissances mensuelles, alertes nutrition"
          target="UNICEF · OMS"
          onPress={() => router.push("/admin/sante-infantile")}
        />

        <SectionCard
          icon="medical"
          color="#0EA5E9"
          title="Accès aux soins"
          desc="Taux d'adhésion CMU, télémédecine, taux de complétion RDV, no-show"
          target="Ministère Santé · CNAM"
          onPress={() => router.push("/admin/acces-soins")}
        />

        <SectionCard
          icon="map"
          color="#A855F7"
          title="Cartographie"
          desc="Top villes, zones sous-desservies, densité médicale par région"
          target="Aménagement territoire · ARS"
          onPress={() => router.push("/admin/geographique")}
        />

        <SectionCard
          icon="trending-up"
          color="#F59E0B"
          title="Tendances médicales"
          desc="Top motifs de consultation, spécialités demandées, écart offre/demande"
          target="Pharma · Recherche médicale"
          onPress={() => router.push("/admin/tendances")}
        />

        <SectionCard
          icon="cash"
          color="#059669"
          title="Finances"
          desc="MRR, méthodes de paiement, paiements aux pros (Mobile Money)"
          target="Investisseurs · Économie numérique"
          onPress={() => router.push("/admin/finances")}
        />

        <SectionCard
          icon="pulse"
          color="#0EA5E9"
          title="Engagement & rétention"
          desc="DAU, WAU, MAU, cohortes par mois, stickiness, messages"
          target="Produit · Marketing"
          onPress={() => router.push("/admin/engagement")}
        />

        <Text style={styles.sectionTitle}>📋 Annuaire utilisateurs</Text>
        <SectionCard
          icon="people"
          color="#6366F1"
          title="Annuaire complet"
          desc="Recherche · Filtres par rôle, ville, statut · Fiches détaillées avec statistiques par utilisateur"
          target="Administration"
          onPress={() => router.push("/admin/annuaire")}
        />

        {/* Export */}
        <View style={styles.exportBox}>
          <Ionicons name="download" size={22} color={COLORS.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.exportTitle}>Rapports exportables CSV</Text>
            <Text style={styles.exportSub}>Disponibles pour chaque section. Format compatible Excel / Power BI / Tableau.</Text>
          </View>
        </View>

        <Text style={styles.footer}>Données générées le {data ? new Date(data.generated_at).toLocaleString("fr-FR") : "—"}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, color = COLORS.primary }: { label: string; color?: string }) {
  return (
    <View style={[styles.chip, { borderColor: color === "#fff" ? "rgba(255,255,255,0.4)" : color }]}>
      <Text style={[styles.chipText, { color: color === "#fff" ? "#fff" : color }]}>{label}</Text>
    </View>
  );
}

function KpiCard({ icon, color, label, value, sub, unit }: { icon: any; color: string; label: string; value: any; sub?: string; unit?: string }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>
        {value} {unit ? <Text style={styles.kpiUnit}>{unit}</Text> : null}
      </Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionCard({ icon, color, title, desc, target, onPress }: { icon: any; color: string; title: string; desc: string; target: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.sectionCard} onPress={onPress}>
      <View style={[styles.sectionIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionCardTitle}>{title}</Text>
        <Text style={styles.sectionCardDesc} numberOfLines={2}>{desc}</Text>
        <View style={styles.targetRow}>
          <Ionicons name="business" size={11} color={COLORS.textMuted} />
          <Text style={styles.targetText}>{target}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, marginBottom: 16 },

  hero: { borderRadius: RADIUS.lg, padding: 20, marginBottom: 16 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  heroValue: { color: "#fff", fontSize: 42, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 4 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroChips: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 12 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpiCard: {
    width: "48.5%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  kpiLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginTop: 2 },
  kpiUnit: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary },
  kpiSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 18, marginBottom: 8 },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  sectionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  sectionCardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  sectionCardDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 15 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  targetText: { fontSize: 10, color: COLORS.textMuted, fontStyle: "italic" },

  exportBox: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, marginTop: 14 },
  exportTitle: { fontSize: 13, fontWeight: "800", color: COLORS.primary },
  exportSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  footer: { textAlign: "center", color: COLORS.textMuted, fontSize: 11, marginTop: 18, fontStyle: "italic" },
});
