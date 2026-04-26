import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

const SECTION_META: Record<string, { title: string; emoji: string; endpoint: string; color: string; target: string }> = {
  "sante-maternelle": { title: "Santé maternelle", emoji: "🤰", endpoint: "maternal-health", color: "#EC4899", target: "OMS · UNICEF · Ministère Santé" },
  "sante-infantile": { title: "Santé infantile", emoji: "👶", endpoint: "child-health", color: "#10B981", target: "UNICEF · OMS" },
  "acces-soins": { title: "Accès aux soins", emoji: "🏥", endpoint: "healthcare-access", color: "#0EA5E9", target: "Ministère Santé · CNAM" },
  "geographique": { title: "Cartographie", emoji: "🗺️", endpoint: "geographic", color: "#A855F7", target: "Aménagement territoire" },
  "tendances": { title: "Tendances médicales", emoji: "📈", endpoint: "medical-trends", color: "#F59E0B", target: "Pharma · Recherche" },
  "finances": { title: "Finances", emoji: "💰", endpoint: "financial", color: "#059669", target: "Investisseurs · Eco. numérique" },
  "engagement": { title: "Engagement & rétention", emoji: "📊", endpoint: "engagement", color: "#0EA5E9", target: "Produit · Marketing" },
};

const fmt = (v: any) => {
  if (typeof v === "number") {
    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(2) + "M";
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "K";
    return v.toLocaleString("fr-FR");
  }
  return String(v ?? "—");
};

export default function AdminSection() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const meta = SECTION_META[(section as string) || ""];
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    if (!meta) return;
    try {
      const r = await api.get(`/admin/metrics/${meta.endpoint}`);
      setData(r.data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [section]));

  const exportCsv = async () => {
    if (!meta) return;
    setExporting(true);
    try {
      const r = await api.get(`/admin/metrics/export?kind=${meta.endpoint}`, { responseType: "text" as any });
      const csv = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `alomaman_${meta.endpoint}.csv`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const path = (FileSystem.cacheDirectory || "") + `alomaman_${meta.endpoint}.csv`;
        await FileSystem.writeAsStringAsync(path, csv);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: "text/csv" });
      }
    } catch (e) {
      Alert.alert("Erreur", "Export impossible");
    } finally {
      setExporting(false);
    }
  };

  if (!meta) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ padding: 20 }}>Section inconnue : {String(section)}</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{meta.emoji} {meta.title}</Text>
          <Text style={styles.target}>Cibles : {meta.target}</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} disabled={exporting}>
          {exporting ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons name="download" size={20} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {data && Object.entries(data).map(([key, value]) => (
          <DataBlock key={key} title={key} value={value} color={meta.color} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function DataBlock({ title, value, color }: { title: string; value: any; color: string }) {
  // Scalaire : rien (montré en haut comme card simple)
  if (typeof value === "number" || typeof value === "string") {
    return (
      <View style={[styles.scalarCard, { borderLeftColor: color }]}>
        <Text style={styles.scalarLabel}>{prettify(title)}</Text>
        <Text style={[styles.scalarValue, { color }]}>{fmt(value)}</Text>
      </View>
    );
  }

  // Object {key: {sous-objet}} → sous-blocs
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const allScalar = Object.values(value).every((v) => typeof v === "number" || typeof v === "string");
    if (allScalar) {
      // Display as bar chart-style table
      const max = Math.max(...Object.values(value).map((v) => (typeof v === "number" ? v : 0)), 1);
      const sorted = Object.entries(value).sort((a, b) => (typeof b[1] === "number" ? (b[1] as number) : 0) - (typeof a[1] === "number" ? (a[1] as number) : 0));
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{prettify(title)}</Text>
          <View style={styles.bars}>
            {sorted.map(([k, v]) => (
              <View key={k} style={styles.barRow}>
                <Text style={styles.barKey} numberOfLines={1}>{prettify(k)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${typeof v === "number" ? (v / max) * 100 : 0}%`, backgroundColor: color }]} />
                </View>
                <Text style={styles.barVal}>{fmt(v)}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }
    // mixed object → recurse
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{prettify(title)}</Text>
        {Object.entries(value).map(([k, v]) => (
          <View key={k} style={styles.subSection}>
            <DataBlock title={k} value={v} color={color} />
          </View>
        ))}
      </View>
    );
  }

  // Array → list of objects
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const sample = value[0];
    if (typeof sample === "object") {
      const keys = Object.keys(sample).filter((k) => !k.startsWith("_")).slice(0, 5);
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{prettify(title)} ({value.length})</Text>
          {value.slice(0, 25).map((row: any, i: number) => (
            <View key={i} style={styles.tableRow}>
              {keys.map((k) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={styles.cellLabel}>{prettify(k)}</Text>
                  <Text style={styles.cellValue} numberOfLines={1}>{fmt(row[k])}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }
  }
  return null;
}

function prettify(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, paddingBottom: 8, gap: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  target: { fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 2 },
  exportBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryLight },

  scalarCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, borderLeftWidth: 4, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  scalarLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  scalarValue: { fontSize: 26, fontWeight: "800", marginTop: 4 },

  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  subSection: { marginTop: 8 },

  bars: { gap: 8 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barKey: { width: 100, fontSize: 11, color: COLORS.textPrimary, fontWeight: "600" },
  barTrack: { flex: 1, height: 18, backgroundColor: COLORS.bgSecondary, borderRadius: 9, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 9 },
  barVal: { width: 50, fontSize: 11, fontWeight: "800", color: COLORS.textPrimary, textAlign: "right" },

  tableRow: { flexDirection: "row", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  cellLabel: { fontSize: 9, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  cellValue: { fontSize: 12, color: COLORS.textPrimary, fontWeight: "600", marginTop: 1 },
});
