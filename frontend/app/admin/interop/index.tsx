/**
 * Hub d'interopérabilité — État de tous les systèmes tiers connectables
 * SIH national · DPI national · Santé CIV · OpenELIS · mSupply · PACS · DHIS2 · SNOMED CT · CNAM/CMU
 */
import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "../../../lib/api";

type System = {
  id: string;
  label: string;
  description: string;
  protocol: string;
  resource_types: string[];
  docs_url?: string;
  configured: boolean;
  base_url?: string;
  has_credentials: boolean;
  last_test?: string;
  last_test_ok?: boolean;
  updated_at?: string;
};

// Icônes par système
const ICONS: Record<string, string> = {
  sih_national: "business",
  dpi_national: "document-lock",
  sante_civ: "globe",
  openelis: "flask",
  msupply: "medical",
  pacs: "scan",
};

// Systèmes déjà implémentés en dehors du hub générique
const NATIVE_SYSTEMS = [
  { id: "dhis2", label: "DHIS2", desc: "Export données agrégées santé publique", route: "/admin/dhis2", icon: "stats-chart", status: "native" },
  { id: "snomed", label: "SNOMED CT", desc: "Codification clinique (240 concepts)", route: null, icon: "medical-outline", status: "native" },
  { id: "cnam_cmu", label: "CNAM / CMU", desc: "Couverture Maladie Universelle CI", route: "/admin/analytics", icon: "shield-checkmark", status: "native" },
];

export default function InteropHub() {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get("/interop/systems");
      setSystems(r.data?.systems || []);
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de charger.");
    } finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const testConnection = async (id: string) => {
    setTesting(id);
    try {
      const r = await api.post(`/interop/test/${id}`);
      const d = r.data;
      Alert.alert(
        d.ok ? "✅ Connexion OK" : "⚠️ Connexion échouée",
        `HTTP ${d.http_status}\nCible : ${d.target}${d.error ? `\n\nErreur : ${d.error}` : ""}`,
      );
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Test impossible.");
    } finally { setTesting(null); }
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  const configuredCount = systems.filter(x => x.configured).length;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={s.hero}>
          <Text style={s.heroTitle}>🔌 Hub d'interopérabilité</Text>
          <Text style={s.heroSub}>
            Systèmes tiers connectables — {configuredCount}/{systems.length} configurés · 3/3 natifs actifs
          </Text>
        </View>

        {/* Systèmes natifs (déjà intégrés dans l'app) */}
        <Text style={s.sectionTitle}>✅ Systèmes actifs (natifs À lo Maman)</Text>
        {NATIVE_SYSTEMS.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[s.card, s.cardNative]}
            onPress={() => n.route && router.push(n.route as any)}
            activeOpacity={n.route ? 0.7 : 1}
          >
            <View style={[s.iconBox, { backgroundColor: "#DCFCE7" }]}>
              <Ionicons name={n.icon as any} size={22} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{n.label}</Text>
              <Text style={s.cardDesc}>{n.desc}</Text>
              <View style={s.badgeRow}>
                <View style={[s.badge, s.badgeOk]}><Text style={s.badgeTxtOk}>Actif</Text></View>
              </View>
            </View>
            {n.route && <Ionicons name="chevron-forward" size={18} color="#94A3B8" />}
          </TouchableOpacity>
        ))}

        {/* Systèmes externes (nécessitent config du ministère) */}
        <Text style={s.sectionTitle}>🔗 Systèmes externes (config requise)</Text>
        {systems.map((sys) => {
          const lastOk = sys.last_test_ok;
          const stateBadge = sys.configured
            ? (lastOk === true ? { bg: "#DCFCE7", fg: "#059669", label: "Testé OK" }
              : lastOk === false ? { bg: "#FEE2E2", fg: "#DC2626", label: "Test KO" }
              : { bg: "#FEF3C7", fg: "#B45309", label: "Prêt (non testé)" })
            : { bg: "#F1F5F9", fg: "#64748B", label: "En attente clés API" };
          return (
            <View key={sys.id} style={s.card}>
              <View style={[s.iconBox, { backgroundColor: sys.configured ? "#FCE7F3" : "#F1F5F9" }]}>
                <Ionicons name={ICONS[sys.id] as any || "cube"} size={22} color={sys.configured ? "#EC4899" : "#94A3B8"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{sys.label}</Text>
                <Text style={s.cardDesc}>{sys.description}</Text>
                <Text style={s.cardProto}>Protocole : {sys.protocol}</Text>
                <View style={s.badgeRow}>
                  <View style={[s.badge, { backgroundColor: stateBadge.bg }]}>
                    <Text style={[s.badgeTxt, { color: stateBadge.fg }]}>{stateBadge.label}</Text>
                  </View>
                  {sys.configured && sys.base_url && (
                    <Text style={s.baseUrl} numberOfLines={1}>{sys.base_url}</Text>
                  )}
                </View>
                <View style={s.actions}>
                  <TouchableOpacity
                    style={s.btnCfg}
                    onPress={() => router.push({ pathname: "/admin/interop/[id]", params: { id: sys.id } } as any)}
                  >
                    <Ionicons name="settings" size={14} color="#fff" />
                    <Text style={s.btnCfgTxt}>{sys.configured ? "Modifier" : "Configurer"}</Text>
                  </TouchableOpacity>
                  {sys.configured && (
                    <TouchableOpacity
                      style={[s.btnTest, testing === sys.id && { opacity: 0.5 }]}
                      onPress={() => testConnection(sys.id)}
                      disabled={testing === sys.id}
                    >
                      {testing === sys.id ? <ActivityIndicator color="#0F172A" size="small" /> : <Ionicons name="pulse" size={14} color="#0F172A" />}
                      <Text style={s.btnTestTxt}>Tester</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={s.historyBtn} onPress={() => router.push("/admin/interop/history" as any)}>
          <Ionicons name="time" size={18} color="#334155" />
          <Text style={s.historyTxt}>Historique des synchronisations</Text>
          <Ionicons name="chevron-forward" size={16} color="#334155" />
        </TouchableOpacity>

        <View style={s.info}>
          <Ionicons name="information-circle" size={16} color="#0369A1" />
          <Text style={s.infoTxt}>
            Les identifiants API (tokens, mots de passe) sont chiffrés au repos (AES-256-GCM).
            Seul le super admin peut les configurer.
            Le ministère peut fournir les URLs et tokens via l'écran de configuration de chaque système.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 60 },
  hero: { marginBottom: 14 },
  heroTitle: { fontSize: 20, fontWeight: "800", color: "#111" },
  heroSub: { color: "#64748B", fontSize: 12, marginTop: 4 },
  sectionTitle: { fontWeight: "800", color: "#334155", fontSize: 13, marginBottom: 8, marginTop: 12 },
  card: { flexDirection: "row", gap: 12, backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 8, alignItems: "flex-start" },
  cardNative: { borderLeftWidth: 3, borderLeftColor: "#059669" },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: "#111", fontSize: 14 },
  cardDesc: { color: "#64748B", fontSize: 12, marginTop: 2, lineHeight: 16 },
  cardProto: { color: "#94A3B8", fontSize: 11, marginTop: 4, fontStyle: "italic" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeOk: { backgroundColor: "#DCFCE7" },
  badgeTxt: { fontSize: 10, fontWeight: "800" },
  badgeTxtOk: { fontSize: 10, fontWeight: "800", color: "#059669" },
  baseUrl: { color: "#64748B", fontSize: 10, fontFamily: "monospace", flex: 1 },
  actions: { flexDirection: "row", gap: 6, marginTop: 8 },
  btnCfg: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EC4899", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  btnCfgTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  btnTest: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  btnTestTxt: { color: "#0F172A", fontSize: 11, fontWeight: "800" },
  historyBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", padding: 12, borderRadius: 10, marginTop: 8, marginBottom: 12 },
  historyTxt: { flex: 1, color: "#334155", fontWeight: "700", fontSize: 13 },
  info: { flexDirection: "row", gap: 8, backgroundColor: "#E0F2FE", padding: 12, borderRadius: 10, alignItems: "flex-start" },
  infoTxt: { flex: 1, color: "#0369A1", fontSize: 11, lineHeight: 15 },
});
