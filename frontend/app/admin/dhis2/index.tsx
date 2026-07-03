/**
 * Écran admin — Export DHIS2
 * - Sélection période (mois / trimestre / année)
 * - Filtre région (optionnel)
 * - Preview des indicateurs agrégés
 * - Export DXF2 JSON + CSV
 * - Push direct vers instance DHIS2 (si config présente)
 * - Historique des exports
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Share, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../../../lib/api";

type Row = { uid: string; code: string; name: string; category: string; value: number };
type Cfg = { configured: boolean; base_url?: string; org_unit_uid?: string; dataset_uid?: string; element_mapping_count?: number; has_token?: boolean; has_password?: boolean };

const PERIOD_TYPES = [
  { id: "monthly", label: "Mensuel" },
  { id: "quarterly", label: "Trimestriel" },
  { id: "yearly", label: "Annuel" },
] as const;

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

const REGIONS_CI = ["", "Abidjan", "Yamoussoukro", "Bouaké", "Korhogo", "Man", "San-Pédro", "Daloa", "Gagnoa"];

export default function AdminDhis2Screen() {
  const now = new Date();
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [num, setNum] = useState<number>(now.getMonth() + 1);
  const [region, setRegion] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [period, setPeriod] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);

  useEffect(() => {
    // Charge la config existante
    api.get<Cfg>("/dhis2/config").then((r: any) => setCfg(r.data)).catch(() => setCfg({ configured: false }));
  }, []);

  const preview = async () => {
    setLoading(true);
    try {
      const r = await api.post("/dhis2/preview", {
        period_type: periodType,
        year, num: periodType === "yearly" ? 1 : num,
        region: region || null,
      });
      setRows(r.data?.rows || []);
      setPeriod(r.data?.period || "");
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de générer la prévisualisation.");
    } finally { setLoading(false); }
  };

  useEffect(() => { preview(); /* eslint-disable-next-line */ }, []);

  const downloadDxf2 = async () => {
    setBusy("dxf2");
    try {
      const r = await api.post("/dhis2/export/dxf2", { period_type: periodType, year, num, region: region || null });
      const jsonStr = JSON.stringify(r.data, null, 2);
      if (Platform.OS === "web") {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `alomaman_dhis2_${r.data.period}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: jsonStr, title: `alomaman_dhis2_${r.data.period}.json` });
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Échec de l'export DXF2.");
    } finally { setBusy(null); }
  };

  const downloadCsv = async () => {
    setBusy("csv");
    try {
      const r = await api.post("/dhis2/export/csv", { period_type: periodType, year, num, region: region || null });
      const csv = r.data?.csv || "";
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `alomaman_dhis2_${r.data.period}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: csv, title: `alomaman_dhis2_${r.data.period}.csv` });
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Échec de l'export CSV.");
    } finally { setBusy(null); }
  };

  const pushToDhis2 = async () => {
    if (!cfg?.configured) {
      Alert.alert("Configuration manquante", "Configurez d'abord l'URL et les identifiants DHIS2.", [
        { text: "Configurer", onPress: () => router.push("/admin/dhis2/config" as any) },
        { text: "Annuler", style: "cancel" },
      ]);
      return;
    }
    setBusy("push");
    try {
      const r = await api.post("/dhis2/push", { period_type: periodType, year, num, region: region || null });
      const d = r.data;
      Alert.alert(
        d.ok ? "✅ Push réussi" : "⚠️ Push échoué",
        `Statut HTTP : ${d.http_status}\nPériode : ${d.period}\norgUnit : ${d.org_unit}\nValeurs : ${d.value_count}\n\n${(d.response || "").toString().slice(0, 200)}`,
      );
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de pousser vers DHIS2.");
    } finally { setBusy(null); }
  };

  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  const grouped = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});
  const catLabels: Record<string, string> = {
    maternal: "👩 Santé maternelle",
    postpartum: "🌸 Post-partum",
    pediatric: "👶 Pédiatrie",
    operational: "⚙️ Opérationnel",
  };

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Config badge */}
        <TouchableOpacity style={s.cfgBadge} onPress={() => router.push("/admin/dhis2/config" as any)}>
          <Ionicons name={cfg?.configured ? "checkmark-circle" : "warning"} size={20} color={cfg?.configured ? "#059669" : "#F59E0B"} />
          <View style={{ flex: 1 }}>
            <Text style={s.cfgTxt}>
              {cfg?.configured ? `DHIS2 configuré → ${cfg.base_url}` : "DHIS2 non configuré (mode export fichier uniquement)"}
            </Text>
            {cfg?.configured && (
              <Text style={s.cfgSub}>orgUnit: {cfg.org_unit_uid || "—"} · mappings: {cfg.element_mapping_count || 0}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#64748B" />
        </TouchableOpacity>

        {/* Sélecteur période */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📅 Période</Text>
          <View style={s.tabs}>
            {PERIOD_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setPeriodType(t.id as any)}
                style={[s.tab, periodType === t.id && s.tabActive]}
              >
                <Text style={[s.tabTxt, periodType === t.id && s.tabTxtActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.inpLabel}>Année</Text>
              <TextInput
                value={String(year)}
                onChangeText={(v) => setYear(parseInt(v || "0") || now.getFullYear())}
                keyboardType="number-pad"
                style={s.inp}
              />
            </View>
            {periodType !== "yearly" && (
              <View style={{ flex: 2, marginLeft: 8 }}>
                <Text style={s.inpLabel}>{periodType === "monthly" ? "Mois" : "Trimestre"}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {(periodType === "monthly" ? MONTHS : ["T1", "T2", "T3", "T4"]).map((label, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setNum(i + 1)}
                      style={[s.monthChip, num === i + 1 && s.monthChipActive]}
                    >
                      <Text style={[s.monthChipTxt, num === i + 1 && s.monthChipTxtActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <Text style={s.inpLabel}>Région (optionnel)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {REGIONS_CI.map((r) => (
              <TouchableOpacity key={r || "all"} onPress={() => setRegion(r)} style={[s.monthChip, region === r && s.monthChipActive]}>
                <Text style={[s.monthChipTxt, region === r && s.monthChipTxtActive]}>{r || "Toutes"}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={preview} style={s.previewBtn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={s.previewTxt}>Actualiser la prévisualisation</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Résultats */}
        {rows.length > 0 && (
          <View style={s.card}>
            <View style={s.summaryRow}>
              <Text style={s.cardTitle}>📊 Indicateurs — {period}</Text>
              <View style={s.summaryBadge}><Text style={s.summaryTxt}>Total : {total}</Text></View>
            </View>
            {Object.entries(grouped).map(([cat, list]) => (
              <View key={cat} style={s.group}>
                <Text style={s.groupTitle}>{catLabels[cat] || cat}</Text>
                {list.map((r) => (
                  <View key={r.uid} style={s.indRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.indName}>{r.name}</Text>
                      <Text style={s.indCode}>{r.uid} · {r.code}</Text>
                    </View>
                    <Text style={[s.indValue, r.value > 0 && { color: "#059669" }]}>{r.value}</Text>
                  </View>
                ))}
              </View>
            ))}

            {/* Actions export */}
            <View style={s.actions}>
              <TouchableOpacity onPress={downloadDxf2} style={[s.actionBtn, s.dxf2Btn]} disabled={busy !== null}>
                {busy === "dxf2" ? <ActivityIndicator color="#fff" /> : <Ionicons name="download" size={18} color="#fff" />}
                <Text style={s.actionTxt}>DXF2 JSON</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={downloadCsv} style={[s.actionBtn, s.csvBtn]} disabled={busy !== null}>
                {busy === "csv" ? <ActivityIndicator color="#fff" /> : <Ionicons name="document-text" size={18} color="#fff" />}
                <Text style={s.actionTxt}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pushToDhis2} style={[s.actionBtn, s.pushBtn, !cfg?.configured && { opacity: 0.6 }]} disabled={busy !== null}>
                {busy === "push" ? <ActivityIndicator color="#fff" /> : <Ionicons name="cloud-upload" size={18} color="#fff" />}
                <Text style={s.actionTxt}>Push DHIS2</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity onPress={() => router.push("/admin/dhis2/history" as any)} style={s.historyLink}>
          <Ionicons name="time" size={18} color="#334155" />
          <Text style={s.historyTxt}>Historique des exports</Text>
          <Ionicons name="chevron-forward" size={16} color="#334155" />
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          ℹ️ Les UIDs actuels (ALM…) sont générés par À lo Maman.{"\n"}
          Pour un push réel, mappez-les aux vrais dataElement UIDs du DHIS2 CI via l'écran Configuration.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 60 },
  cfgBadge: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: "#F59E0B" },
  cfgTxt: { fontWeight: "700", color: "#111", fontSize: 13 },
  cfgSub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 14 },
  cardTitle: { fontWeight: "800", fontSize: 15, color: "#111", marginBottom: 10 },
  tabs: { flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 999, padding: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 999 },
  tabActive: { backgroundColor: "#EC4899" },
  tabTxt: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  tabTxtActive: { color: "#fff" },
  row: { flexDirection: "row", marginBottom: 10 },
  inpLabel: { color: "#64748B", fontSize: 11, marginBottom: 4, marginTop: 4, fontWeight: "700" },
  inp: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#111" },
  monthChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "#F1F5F9" },
  monthChipActive: { backgroundColor: "#EC4899" },
  monthChipTxt: { fontSize: 12, color: "#334155", fontWeight: "600" },
  monthChipTxtActive: { color: "#fff" },
  previewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0F172A", paddingVertical: 12, borderRadius: 10, marginTop: 14 },
  previewTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  summaryBadge: { backgroundColor: "#EC4899", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  summaryTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  group: { marginBottom: 12 },
  groupTitle: { color: "#0F172A", fontWeight: "800", fontSize: 13, marginBottom: 6 },
  indRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  indName: { color: "#0F172A", fontSize: 13 },
  indCode: { color: "#94A3B8", fontSize: 10, fontFamily: "monospace", marginTop: 1 },
  indValue: { color: "#0F172A", fontWeight: "800", fontSize: 16 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10 },
  actionTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  dxf2Btn: { backgroundColor: "#0891B2" },
  csvBtn: { backgroundColor: "#059669" },
  pushBtn: { backgroundColor: "#EC4899" },
  historyLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 12 },
  historyTxt: { flex: 1, color: "#334155", fontWeight: "700", fontSize: 13 },
  disclaimer: { fontSize: 11, color: "#94A3B8", padding: 12, textAlign: "center", lineHeight: 16 },
});
