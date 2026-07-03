/**
 * Historique des exports DHIS2 (audit)
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../lib/api";

type Item = {
  id: string;
  user_id: string;
  format: string;
  period: string;
  org_unit: string;
  region?: string;
  target_url?: string;
  http_status?: number;
  value_count: number;
  exported_at: string;
};

export default function DHIS2HistoryScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/dhis2/history?limit=100");
      setItems(r.data?.items || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {items.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTxt}>Aucun export effectué.</Text>
          </View>
        ) : items.map((it) => {
          const ok = !it.http_status || (it.http_status >= 200 && it.http_status < 300);
          return (
            <View key={it.id} style={[s.item, !ok && s.itemFail]}>
              <View style={s.itemHead}>
                <Ionicons
                  name={it.format === "push_dhis2" ? "cloud-upload" : it.format === "csv" ? "document-text" : "download"}
                  size={20}
                  color={ok ? "#059669" : "#DC2626"}
                />
                <Text style={s.itemFormat}>{it.format.toUpperCase()}</Text>
                <Text style={s.itemPeriod}>{it.period}</Text>
                {it.http_status !== undefined && (
                  <Text style={[s.itemStatus, ok ? s.itemStatusOk : s.itemStatusFail]}>HTTP {it.http_status}</Text>
                )}
              </View>
              <Text style={s.itemMeta}>OrgUnit : {it.org_unit} · {it.value_count} valeur{it.value_count > 1 ? "s" : ""}{it.region ? ` · Région : ${it.region}` : ""}</Text>
              {it.target_url && <Text style={s.itemUrl}>→ {it.target_url}</Text>}
              <Text style={s.itemDate}>{new Date(it.exported_at).toLocaleString("fr-FR")}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 60 },
  empty: { padding: 40, alignItems: "center" },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: "#64748B", fontSize: 14 },
  item: { backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: "#059669" },
  itemFail: { borderLeftColor: "#DC2626" },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  itemFormat: { fontWeight: "800", color: "#0F172A", fontSize: 12 },
  itemPeriod: { color: "#EC4899", fontWeight: "700", fontFamily: "monospace" },
  itemStatus: { marginLeft: "auto", fontSize: 11, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  itemStatusOk: { backgroundColor: "#DCFCE7", color: "#059669" },
  itemStatusFail: { backgroundColor: "#FEE2E2", color: "#DC2626" },
  itemMeta: { color: "#334155", fontSize: 12 },
  itemUrl: { color: "#64748B", fontSize: 11, fontFamily: "monospace", marginTop: 2 },
  itemDate: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
});
