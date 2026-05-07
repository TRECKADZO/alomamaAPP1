/**
 * Carnet Médical Visuel — À lo Maman
 * ==================================
 * Écran principal du carnet médical pédiatrique avec :
 *   1. En-tête enfant (photo, nom, âge, score DMP)
 *   2. Sélecteur horizontal des 6 modules d'âge
 *   3. Vue par module : Vaccins, Croissance, Examens, Allergies
 *   4. Boutons d'export PDF + JSON FHIR R4
 *
 * Route : /carnet/{enfant_id}
 * Backend : /api/enfants/{id}/carnet/{module}, /api/fhir/Composition/{id},
 *           /api/enfants/{id}/carnet/export/pdf, /api/enfants/{id}/carnet/export/fhir
 */
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../lib/api";
import { TOKEN_KEY } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

// ============================================================================
// Types
// ============================================================================
type AgeModule = {
  key: string;
  label: string;
  emoji?: string;
  min_m: number;
  max_m: number;
  sections: string[];
  relevant_for_pro: boolean;
};

type Immunization = {
  id?: string;
  status: string;
  vaccineCode: { text?: string };
  occurrenceDateTime?: string;
  lotNumber?: string;
};

type Observation = {
  code: { text?: string };
  effectiveDateTime?: string;
  valueQuantity?: { value: number; unit: string };
};

type CarnetModule = {
  enfant: { id: string; nom: string; sexe: string; date_naissance: string; age_mois: number };
  module: string;
  module_label: string;
  module_sections: string[];
  is_current_module: boolean;
  is_relevant_for_pro: boolean;
  current_pro_specialty?: string;
  immunizations_count: number;
  observations_count: number;
  immunizations: Immunization[];
  observations: Observation[];
};

const MODULE_EMOJIS: Record<string, string> = {
  naissance: "👶",
  "0-6m": "🍼",
  "6-24m": "🧸",
  "2-5a": "🎈",
  "6-12a": "🎒",
  "13-18a": "🏃",
};

const MODULE_COLORS: Record<string, string> = {
  naissance: "#EC4899",
  "0-6m": "#F59E0B",
  "6-24m": "#10B981",
  "2-5a": "#3B82F6",
  "6-12a": "#8B5CF6",
  "13-18a": "#EF4444",
};

// ============================================================================
// Composant principal
// ============================================================================
export default function CarnetEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [modules, setModules] = useState<AgeModule[]>([]);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [carnet, setCarnet] = useState<CarnetModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "fhir" | null>(null);

  // Charge la liste des modules + sélectionne celui correspondant à l'âge
  const loadModules = async () => {
    try {
      const r = await api.get("/fhir/age-modules");
      setModules(r.data.modules || []);
    } catch (e: any) {
      console.error("Modules load error", e);
    }
  };

  // Charge un module précis
  const loadModule = async (moduleKey: string) => {
    if (!id) return;
    setModuleLoading(true);
    try {
      const r = await api.get(`/enfants/${id}/carnet/${moduleKey}`);
      setCarnet(r.data);
      // Détermine le module actif initial = is_current_module si pas encore choisi
      if (activeModule === null) {
        setActiveModule(moduleKey);
      }
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible de charger ce module");
    } finally {
      setModuleLoading(false);
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadModules();
      })();
    }, [id])
  );

  // Sélectionne le module courant à l'âge de l'enfant dès que les modules sont chargés
  useEffect(() => {
    if (modules.length === 0 || !id) return;
    if (activeModule) {
      loadModule(activeModule);
      return;
    }
    // Trouve le module dont l'âge actuel rentre
    (async () => {
      try {
        // Premier appel : on prend "0-6m" par défaut (sera ajusté par is_current_module dans la réponse)
        const guess = "0-6m";
        const r = await api.get(`/enfants/${id}/carnet/${guess}`);
        const childAge = r.data?.enfant?.age_mois ?? 0;
        const current = modules.find(
          (m) => childAge >= m.min_m && childAge < m.max_m
        )?.key || "0-6m";
        setActiveModule(current);
        loadModule(current);
      } catch {
        setActiveModule("0-6m");
        loadModule("0-6m");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules.length]);

  // Tap sur un module = changement
  const onSelectModule = (key: string) => {
    if (key === activeModule) return;
    setActiveModule(key);
    loadModule(key);
  };

  // ============================================================================
  // EXPORTS
  // ============================================================================
  const exportPdf = async () => {
    if (!id || exporting) return;
    setExporting("pdf");
    try {
      const baseUrl = (api.defaults as any).baseURL || "";
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const downloadUrl = `${baseUrl}/enfants/${id}/carnet/export/pdf`;

      if (Platform.OS === "web") {
        // Sur web : ouvre dans un nouvel onglet avec auth header via fetch
        const r = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `carnet_${(carnet?.enfant?.nom || "enfant").replace(/\s+/g, "_")}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Alert.alert("✅ PDF téléchargé", "Le carnet médical a été téléchargé.");
      } else {
        // Mobile : downloadAsync + share
        const fileUri = `${FileSystem.cacheDirectory}carnet_${id}.pdf`;
        const dl = await FileSystem.downloadAsync(downloadUrl, fileUri, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
        const can = await Sharing.isAvailableAsync();
        if (can) {
          await Sharing.shareAsync(dl.uri, {
            mimeType: "application/pdf",
            dialogTitle: "Carnet médical",
          });
        } else {
          Alert.alert("PDF généré", `Sauvegardé : ${dl.uri}`);
        }
      }
    } catch (e: any) {
      Alert.alert("Erreur", `Export PDF impossible : ${e?.message || ""}`);
    } finally {
      setExporting(null);
    }
  };

  const exportFhir = async () => {
    if (!id || exporting) return;
    setExporting("fhir");
    try {
      const r = await api.get(`/enfants/${id}/carnet/export/fhir`);
      const json = JSON.stringify(r.data, null, 2);
      const filename = `carnet_${(carnet?.enfant?.nom || "enfant").replace(/\s+/g, "_")}_FHIR.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/fhir+json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Alert.alert("✅ FHIR téléchargé", "Le bundle FHIR R4 a été téléchargé.");
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        const can = await Sharing.isAvailableAsync();
        if (can) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/fhir+json",
            dialogTitle: "Bundle FHIR R4",
          });
        } else {
          Alert.alert("FHIR exporté", `Sauvegardé : ${fileUri}`);
        }
      }
    } catch (e: any) {
      Alert.alert("Erreur", `Export FHIR impossible : ${e?.message || ""}`);
    } finally {
      setExporting(null);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12, color: COLORS.textSecondary }}>Chargement du carnet…</Text>
      </SafeAreaView>
    );
  }

  if (!carnet) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text>Aucune donnée</Text>
      </SafeAreaView>
    );
  }

  const enfant = carnet.enfant;
  const annees = Math.floor(enfant.age_mois / 12);
  const mois = enfant.age_mois % 12;
  const ageStr = annees > 0 ? `${annees} an${annees > 1 ? "s" : ""} ${mois}m` : `${enfant.age_mois} mois`;
  const moduleColor = MODULE_COLORS[carnet.module] || COLORS.primary;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* HEADER */}
      <LinearGradient colors={["#0E7C3E", "#10B981"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="carnet-back">
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>📋 Carnet médical</Text>
          <Text style={styles.headerSub}>
            {enfant.nom} · {ageStr} · {enfant.sexe === "F" ? "Fille" : "Garçon"}
          </Text>
        </View>
        <View style={styles.fhirBadge}>
          <Text style={styles.fhirBadgeText}>FHIR R4</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
        {/* Sélecteur de modules — horizontal */}
        <Text style={styles.sectionTitle}>📅 Choisir un module d'âge</Text>
        {carnet.current_pro_specialty && (
          <Text style={styles.sectionSub}>
            Vue adaptée à : <Text style={{ fontWeight: "800" }}>{carnet.current_pro_specialty}</Text>
          </Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modulesRow} testID="modules-scroll">
          {modules.map((m) => {
            const isActive = m.key === activeModule;
            const color = MODULE_COLORS[m.key] || COLORS.primary;
            const isCurrent = m.min_m <= enfant.age_mois && enfant.age_mois < m.max_m;
            return (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.moduleCard,
                  isActive && { borderColor: color, borderWidth: 2.5, backgroundColor: `${color}15` },
                  !m.relevant_for_pro && { opacity: 0.5 },
                ]}
                onPress={() => onSelectModule(m.key)}
                testID={`module-${m.key}`}
              >
                <Text style={styles.moduleEmoji}>{MODULE_EMOJIS[m.key] || "📅"}</Text>
                <Text style={[styles.moduleLabel, isActive && { color }]} numberOfLines={2}>
                  {m.label}
                </Text>
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Actuel</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Synthèse module */}
        <View style={[styles.summaryCard, { borderLeftColor: moduleColor }]}>
          <Text style={styles.summaryTitle}>{MODULE_EMOJIS[carnet.module]} {carnet.module_label}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryNum, { color: moduleColor }]}>{carnet.immunizations_count}</Text>
              <Text style={styles.summaryLab}>Vaccins</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryNum, { color: moduleColor }]}>{carnet.observations_count}</Text>
              <Text style={styles.summaryLab}>Mesures</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={[styles.summaryNum, { color: moduleColor }]}>{carnet.module_sections.length}</Text>
              <Text style={styles.summaryLab}>Sections</Text>
            </View>
          </View>
        </View>

        {moduleLoading ? (
          <ActivityIndicator color={moduleColor} style={{ marginVertical: 30 }} />
        ) : (
          <>
            {/* Section Vaccins */}
            <SectionHeader emoji="💉" title="Vaccinations" count={carnet.immunizations_count} color="#10B981" />
            {carnet.immunizations.length === 0 ? (
              <EmptyText label="Aucun vaccin enregistré pour ce module." />
            ) : (
              carnet.immunizations.map((v, i) => {
                const done = v.status === "completed";
                return (
                  <View key={`${v.id || i}`} style={[styles.itemCard, done && { borderLeftColor: "#10B981", borderLeftWidth: 3 }]}>
                    <View style={styles.itemRow}>
                      <Text style={styles.itemEmoji}>💉</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{v.vaccineCode?.text || "Vaccin"}</Text>
                        <Text style={styles.itemSub}>
                          {v.occurrenceDateTime ? new Date(v.occurrenceDateTime).toLocaleDateString("fr-FR") : "—"}
                          {v.lotNumber ? ` · Lot ${v.lotNumber}` : ""}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: done ? "#10B98122" : "#F59E0B22" }]}>
                        <Text style={[styles.statusPillText, { color: done ? "#10B981" : "#F59E0B" }]}>
                          {done ? "✓ Fait" : "À faire"}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {/* Section Croissance */}
            <SectionHeader emoji="📈" title="Croissance & signes vitaux" count={carnet.observations_count} color="#3B82F6" />
            {carnet.observations.length === 0 ? (
              <EmptyText label="Aucune mesure pour ce module." />
            ) : (
              carnet.observations.map((o, i) => {
                const label = o.code?.text || "Observation";
                const val = o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit}` : "—";
                return (
                  <View key={i} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <Text style={styles.itemEmoji}>{label.includes("weight") ? "⚖️" : label.includes("height") ? "📏" : label.includes("Head") ? "🧠" : label.includes("temperature") ? "🌡️" : "📈"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{label}</Text>
                        <Text style={styles.itemSub}>
                          {o.effectiveDateTime ? new Date(o.effectiveDateTime).toLocaleDateString("fr-FR") : "—"}
                        </Text>
                      </View>
                      <Text style={styles.valueText}>{val}</Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Lien vers OMS chart si croissance */}
            {carnet.observations_count > 0 && (
              <TouchableOpacity
                style={styles.linkCard}
                onPress={() => router.push(`/croissance/${id}` as any)}
                testID="link-oms-chart"
              >
                <Ionicons name="trending-up" size={18} color="#3B82F6" />
                <Text style={styles.linkCardText}>Voir les courbes de croissance OMS</Text>
                <Ionicons name="chevron-forward" size={18} color="#3B82F6" />
              </TouchableOpacity>
            )}

            {/* Lien vers DMP */}
            <TouchableOpacity
              style={styles.linkCard}
              onPress={() => router.push(`/dmp/${id}` as any)}
              testID="link-dmp"
            >
              <Ionicons name="sparkles" size={18} color="#A855F7" />
              <Text style={styles.linkCardText}>Voir le suivi du développement (DMP)</Text>
              <Ionicons name="chevron-forward" size={18} color="#A855F7" />
            </TouchableOpacity>
          </>
        )}

        {/* EXPORTS */}
        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportPdfBtn]}
            onPress={exportPdf}
            disabled={exporting !== null}
            testID="btn-export-pdf"
          >
            {exporting === "pdf" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="document-text" size={20} color="#fff" />
                <Text style={styles.exportText}>Exporter PDF</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportFhirBtn]}
            onPress={exportFhir}
            disabled={exporting !== null}
            testID="btn-export-fhir"
          >
            {exporting === "fhir" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="code-slash" size={20} color="#fff" />
                <Text style={styles.exportText}>Bundle FHIR</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          🌐 Format compatible HL7 FHIR R4 — préparé pour l'interopérabilité avec le Bus National d'Interopérabilité de Santé (Côte d'Ivoire).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Sous-composants
// ============================================================================
function SectionHeader({ emoji, title, count, color }: any) {
  return (
    <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
      <Text style={styles.sectionHeaderTitle}>{emoji} {title}</Text>
      <Text style={[styles.sectionHeaderCount, { color }]}>{count}</Text>
    </View>
  );
}

function EmptyText({ label }: { label: string }) {
  return <Text style={styles.emptyText}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },

  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 2 },
  fhirBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  fhirBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8, marginBottom: 6 },
  sectionSub: { fontSize: 11, color: COLORS.textMuted, marginBottom: 8 },

  modulesRow: { gap: 10, paddingVertical: 4, paddingRight: 16 },
  moduleCard: { width: 100, padding: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", ...SHADOW },
  moduleEmoji: { fontSize: 28 },
  moduleLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary, textAlign: "center", marginTop: 4 },
  currentBadge: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "#10B981", borderRadius: 999 },
  currentBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  summaryCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, borderLeftWidth: 4, marginTop: 14, marginBottom: 8, ...SHADOW },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-around" },
  summaryStat: { alignItems: "center" },
  summaryNum: { fontSize: 24, fontWeight: "900" },
  summaryLab: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10, paddingLeft: 10, borderLeftWidth: 3 },
  sectionHeaderTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  sectionHeaderCount: { fontSize: 18, fontWeight: "900" },

  itemCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemEmoji: { fontSize: 22 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  itemSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  valueText: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: "800" },

  emptyText: { textAlign: "center", color: COLORS.textMuted, fontStyle: "italic", padding: 14, fontSize: 12 },

  linkCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 },
  linkCardText: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.textPrimary },

  exportRow: { flexDirection: "row", gap: 10, marginTop: 24 },
  exportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: RADIUS.md, ...SHADOW },
  exportPdfBtn: { backgroundColor: "#EF4444" },
  exportFhirBtn: { backgroundColor: "#0EA5E9" },
  exportText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  footerNote: { fontSize: 10, color: COLORS.textMuted, textAlign: "center", marginTop: 14, lineHeight: 14, fontStyle: "italic" },
});
