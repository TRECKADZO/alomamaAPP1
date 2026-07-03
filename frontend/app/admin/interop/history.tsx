/**
 * Historique des synchronisations interop (push vers systèmes tiers)
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../lib/api";

type Item = {
  id: string; system_id: string; resource_type: string;
  target_url: string; http_status: number;
  user_id: string; pushed_at: string;
};

const SYSTEM_LABELS: Record<string, string> = {
  sih_national: "SIH national",
  dpi_national: "DPI national",
  sante_civ: "Santé CIV",
  openelis: "OpenELIS",
  msupply: "mSupply",
  pacs: "PACS",
};

export default function InteropHistory() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/interop/history?limit=200");
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
            <Text style={s.emptyTxt}>Aucune synchronisation effectuée.</Text>
            <Text style={s.emptySub}>Les push apparaîtront ici dès qu'un système externe sera configuré.</Text>
          </View>
        ) : items.map((it) => {
          const ok = it.http_status >= 200 && it.http_status < 300;
          return (
            <View key={it.id} style={[s.item, !ok && s.itemFail]}>
              <View style={s.itemHead}>
                <Ionicons name="cloud-upload" size={20} color={ok ? "#059669" : "#DC2626"} />
                <Text style={s.itemSys}>{SYSTEM_LABELS[it.system_id] || it.system_id}</Text>
                <Text style={s.itemRes}>{it.resource_type}</Text>
                <Text style={[s.itemStatus, ok ? s.itemStatusOk : s.itemStatusFail]}>HTTP {it.http_status}</Text>
              </View>
              <Text style={s.itemUrl}>→ {it.target_url}</Text>
              <Text style={s.itemDate}>{new Date(it.pushed_at).toLocaleString("fr-FR")}</Text>
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
  emptyTxt: { color: "#64748B", fontSize: 14, fontWeight: "700" },
  emptySub: { color: "#94A3B8", fontSize: 12, marginTop: 6, textAlign: "center" },
  item: { backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: "#059669" },
  itemFail: { borderLeftColor: "#DC2626" },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  itemSys: { fontWeight: "800", color: "#0F172A", fontSize: 13 },
  itemRes: { color: "#EC4899", fontWeight: "700", fontSize: 12 },
  itemStatus: { marginLeft: "auto", fontSize: 11, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  itemStatusOk: { backgroundColor: "#DCFCE7", color: "#059669" },
  itemStatusFail: { backgroundColor: "#FEE2E2", color: "#DC2626" },
  itemUrl: { color: "#64748B", fontSize: 11, fontFamily: "monospace", marginTop: 2 },
  itemDate: { color: "#94A3B8", fontSize: 11, marginTop: 4 },
});
