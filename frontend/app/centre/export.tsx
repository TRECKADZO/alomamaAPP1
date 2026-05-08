/**
 * Export Centre 💎 — CSV/JSON mensuel pour la comptabilité du centre.
 * Réservé aux Centres Premium.
 * Route: /centre/export
 */
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import PremiumGate from "../../components/PremiumGate";

function monthsList(n: number = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function CentreExport() {
  const router = useRouter();
  const months = monthsList(12);
  const [mois, setMois] = useState(months[0]);
  const [downloading, setDownloading] = useState(false);
  const [lastInfo, setLastInfo] = useState<any>(null);
  const [premiumBlocked, setPremiumBlocked] = useState<string | null>(null);

  const exportFile = async (fmt: "csv" | "json") => {
    setDownloading(true);
    setPremiumBlocked(null);
    try {
      const r = await api.get(`/centre/export?mois=${mois}&fmt=${fmt}`);
      const data = r.data;
      if (fmt === "csv") {
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
        setLastInfo({ rows: data.rows, fmt });
      } else {
        // JSON — afficher juste le compte (le frontend pourrait l'envoyer à un endpoint partenaire)
        setLastInfo({ rows: data.rows, fmt, json: data.rows });
        Alert.alert("Export JSON 📦", `${data.rows} ligne(s) prêtes pour intégration logiciel de gestion.`);
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.error === "premium_required") {
        setPremiumBlocked(detail.message || "L'export est réservé aux Centres Premium.");
      } else {
        Alert.alert("Erreur", formatError(e));
      }
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
          <Text style={styles.title}>Export Centre 💎</Text>
          <Text style={styles.sub}>CSV (Excel) ou JSON (logiciel de gestion)</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
        {premiumBlocked ? (
          <PremiumGate
            message={premiumBlocked}
            color="#0EA5E9"
            benefits="Inclus avec Centre Premium : Export CSV/JSON · Tableau de bord · Finance par pro · Support prioritaire."
          />
        ) : (
        <>
        <Text style={styles.label}>Mois à exporter</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {months.map((m) => (
            <TouchableOpacity key={m} onPress={() => setMois(m)} style={[styles.chip, mois === m && styles.chipActive]}>
              <Text style={[styles.chipText, mois === m && { color: "#fff" }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ gap: 10 }}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: "#10B981" }]} onPress={() => exportFile("csv")} disabled={downloading}>
            {downloading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="document-text" size={20} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.btnTitle}>Exporter en CSV</Text>
                  <Text style={styles.btnSub}>Compatible Excel, Libre Office, Google Sheets</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: "#A855F7" }]} onPress={() => exportFile("json")} disabled={downloading}>
            <Ionicons name="code-slash" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.btnTitle}>Récupérer JSON</Text>
              <Text style={styles.btnSub}>Intégration logiciel de gestion / API</Text>
            </View>
          </TouchableOpacity>
        </View>

        {lastInfo && (
          <View style={styles.info}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.infoText}>Export {lastInfo.fmt.toUpperCase()} : {lastInfo.rows} ligne(s) {lastInfo.fmt === "csv" ? "téléchargée(s)" : "prêtes"}.</Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          📊 Le fichier contient toutes les consultations payées du mois sélectionné, regroupées par professionnel. Conservez ces relevés ≥ 5 ans pour vos obligations comptables.
        </Text>
        </>
        )}
      </ScrollView>
    </SafeAreaView>
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
  btn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: RADIUS.md, ...SHADOW },
  btnTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  info: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: RADIUS.md, backgroundColor: "#D1FAE5", marginTop: 16 },
  infoText: { fontSize: 12, color: "#065F46", flex: 1, fontWeight: "700" },
  disclaimer: { fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: 20, lineHeight: 16, paddingHorizontal: 12 },
});
