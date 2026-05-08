/**
 * Comptabilité Pro 💎 — Export CSV mensuel des consultations payées.
 * Réservé aux Pros Premium.
 * Route: /pro/comptabilite
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

function monthsList(n: number = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function ProComptabilite() {
  const router = useRouter();
  const months = monthsList(12);
  const [mois, setMois] = useState(months[0]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = async (ym: string) => {
    setLoading(true);
    setData(null);
    try {
      const r = await api.get(`/pro/comptabilite/export?mois=${ym}`);
      setData(r.data);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        Alert.alert("Premium requis 💎", detail.message, [
          { text: "Plus tard", style: "cancel" },
          { text: "Devenir Premium", onPress: () => router.push("/premium") },
        ]);
      } else {
        Alert.alert("Erreur", formatError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(mois); }, [mois]);

  const downloadCsv = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = `data:text/csv;base64,${data.base64}`;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${data.filename}`;
        await FileSystem.writeAsStringAsync(fileUri, data.base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: data.filename });
        }
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#0EA5E9", "#0369A1"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Comptabilité 💎</Text>
          <Text style={styles.sub}>Export CSV mensuel · Premium</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        <Text style={styles.label}>Sélectionner un mois</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {months.map((m) => (
            <TouchableOpacity key={m} onPress={() => setMois(m)} style={[styles.chip, mois === m && styles.chipActive]}>
              <Text style={[styles.chipText, mois === m && { color: "#fff" }]}>{monthLabel(m)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading && <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 24 }} />}

        {!loading && data && (
          <>
            <View style={styles.statsRow}>
              <Stat color="#10B981" label="Brut" value={`${data.total_brut?.toLocaleString() || 0} F`} />
              <Stat color="#EF4444" label="Commission" value={`${data.total_commission?.toLocaleString() || 0} F`} />
              <Stat color="#3B82F6" label="Net" value={`${data.total_net?.toLocaleString() || 0} F`} />
            </View>
            <Text style={styles.note}>{data.rows} consultation(s) payée(s) en {monthLabel(data.mois)}</Text>
            <TouchableOpacity style={styles.downloadBtn} onPress={downloadCsv} disabled={downloading || data.rows === 0}>
              {downloading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="cloud-download" size={20} color="#fff" />
                  <Text style={styles.downloadText}>Télécharger CSV ({data.rows} ligne{data.rows > 1 ? "s" : ""})</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.disclaimer}>
              Le fichier CSV est compatible Excel (Libre Office, Google Sheets). Conservez ces relevés ≥ 5 ans pour vos obligations comptables.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={[styles.stat, { borderTopColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  label: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  chipActive: { backgroundColor: "#0EA5E9", borderColor: "#0EA5E9" },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderTopWidth: 3, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  note: { fontSize: 12, color: COLORS.textSecondary, marginVertical: 12, textAlign: "center" },
  downloadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0EA5E9", padding: 14, borderRadius: RADIUS.md, ...SHADOW },
  downloadText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 16, lineHeight: 16, paddingHorizontal: 12 },
});
