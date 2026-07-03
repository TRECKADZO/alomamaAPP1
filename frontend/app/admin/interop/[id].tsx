/**
 * Configuration d'un système d'interopérabilité (SIH, DPI, Santé CIV, OpenELIS, mSupply, PACS)
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Switch, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../../lib/api";

type Sys = {
  id: string; label: string; description: string; protocol: string;
  resource_types: string[]; docs_url?: string;
  configured: boolean; base_url?: string; username?: string;
  has_token?: boolean; has_password?: boolean; extra?: any;
  last_test?: string; last_test_ok?: boolean;
};

// Champs "extra" par système (facility_id, provider_id, etc.)
const EXTRA_FIELDS: Record<string, { key: string; label: string; placeholder?: string }[]> = {
  sih_national: [
    { key: "facility_id", label: "ID Établissement (SIH)", placeholder: "ex. HGA-001" },
  ],
  dpi_national: [
    { key: "provider_id", label: "ID Provider FHIR", placeholder: "ex. PRO-1234" },
  ],
  sante_civ: [
    { key: "app_key", label: "App Key (portail Santé CIV)" },
  ],
  openelis: [
    { key: "lab_code", label: "Code Laboratoire" },
  ],
  msupply: [
    { key: "store_id", label: "Store ID mSupply", placeholder: "ex. STORE_ABJ_01" },
    { key: "site_name", label: "Nom du site" },
  ],
  pacs: [
    { key: "aet_local", label: "AET Local (Application Entity Title)" },
    { key: "aet_remote", label: "AET Distant (PACS server)" },
  ],
};

export default function InteropConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sys, setSys] = useState<Sys | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [useToken, setUseToken] = useState(true);
  const [extra, setExtra] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const [cfg, sys] = await Promise.all([
          api.get(`/interop/config/${id}`),
          api.get("/interop/systems"),
        ]);
        const found = (sys.data?.systems || []).find((x: Sys) => x.id === id);
        setMeta(found);
        if (cfg.data?.configured) {
          setSys(cfg.data);
          setBaseUrl(cfg.data.base_url || "");
          setUsername(cfg.data.username || "");
          setUseToken(!!cfg.data.has_token);
          setExtra(cfg.data.extra || {});
        }
      } catch (e: any) {
        Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de charger.");
      } finally { setLoading(false); }
    })();
  }, [id]);

  const save = async () => {
    if (!baseUrl.trim()) { Alert.alert("Champ requis", "URL de base obligatoire."); return; }
    setSaving(true);
    try {
      const payload: any = {
        system_id: id,
        base_url: baseUrl.trim(),
        extra,
      };
      if (useToken) {
        if (apiToken.trim()) payload.api_token = apiToken.trim();
      } else {
        payload.username = username.trim();
        if (password.trim()) payload.password = password.trim();
      }
      await api.post("/interop/config", payload);
      Alert.alert("✅ Enregistré", "Configuration sauvegardée.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Échec.");
    } finally { setSaving(false); }
  };

  const testConn = async () => {
    setTesting(true);
    try {
      const r = await api.post(`/interop/test/${id}`);
      Alert.alert(
        r.data?.ok ? "✅ Connexion OK" : "⚠️ Échec",
        `HTTP ${r.data?.http_status}\n${r.data?.target}${r.data?.error ? `\n\n${r.data.error}` : ""}`,
      );
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Test impossible.");
    } finally { setTesting(false); }
  };

  const deleteConfig = () => {
    Alert.alert(
      "Supprimer la configuration ?",
      `La config de "${meta?.label}" sera effacée définitivement.\nL'historique des synchronisations reste conservé pour audit.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/interop/config/${id}`);
              Alert.alert("✅ Supprimé", "Configuration effacée.", [{ text: "OK", onPress: () => router.back() }]);
            } catch (e: any) {
              Alert.alert("Erreur", e?.response?.data?.detail || "Échec de la suppression.");
            }
          },
        },
      ],
    );
  };

  if (loading || !meta) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  const extras = EXTRA_FIELDS[id as string] || [];

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Text style={s.title}>🔌 {meta.label}</Text>
          <Text style={s.subtitle}>{meta.description}</Text>
          <View style={s.protoRow}>
            <View style={s.protoBadge}><Text style={s.protoTxt}>{meta.protocol}</Text></View>
            {meta.docs_url && (
              <TouchableOpacity onPress={() => Linking.openURL(meta.docs_url)}>
                <Text style={s.docsLink}>📄 Documentation</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>🌐 Connexion</Text>
          <Text style={s.label}>URL de base *</Text>
          <TextInput
            value={baseUrl} onChangeText={setBaseUrl}
            placeholder="https://…" placeholderTextColor="#94A3B8"
            style={s.inp} autoCapitalize="none" keyboardType="url"
          />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <Text style={s.label}>Auth par Bearer Token (recommandé)</Text>
            <Switch value={useToken} onValueChange={setUseToken} />
          </View>
          {useToken ? (
            <>
              <Text style={s.label}>API Token</Text>
              <TextInput
                value={apiToken} onChangeText={setApiToken}
                placeholder={sys?.has_token ? "•••••• (laissez vide pour ne pas modifier)" : "Bearer token"}
                placeholderTextColor="#94A3B8"
                style={s.inp} secureTextEntry autoCapitalize="none"
              />
            </>
          ) : (
            <>
              <Text style={s.label}>Username</Text>
              <TextInput value={username} onChangeText={setUsername} placeholder="admin" placeholderTextColor="#94A3B8" style={s.inp} autoCapitalize="none" />
              <Text style={s.label}>Mot de passe</Text>
              <TextInput value={password} onChangeText={setPassword} placeholder={sys?.has_password ? "•••••• (laissez vide pour ne pas modifier)" : ""} placeholderTextColor="#94A3B8" style={s.inp} secureTextEntry />
            </>
          )}
        </View>

        {extras.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>⚙️ Paramètres spécifiques</Text>
            {extras.map((f) => (
              <View key={f.key}>
                <Text style={s.label}>{f.label}</Text>
                <TextInput
                  value={extra[f.key] || ""}
                  onChangeText={(v) => setExtra({ ...extra, [f.key]: v })}
                  placeholder={f.placeholder || ""}
                  placeholderTextColor="#94A3B8"
                  style={s.inp}
                  autoCapitalize="none"
                />
              </View>
            ))}
          </View>
        )}

        {meta.resource_types?.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>📋 Ressources supportées</Text>
            <View style={s.chipsRow}>
              {meta.resource_types.map((r: string) => (
                <View key={r} style={s.resChip}><Text style={s.resChipTxt}>{r}</Text></View>
              ))}
            </View>
          </View>
        )}

        <View style={s.btnRow}>
          <TouchableOpacity onPress={save} style={[s.saveBtn, saving && { opacity: 0.5 }]} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="save" size={16} color="#fff" />
                <Text style={s.saveTxt}>Enregistrer</Text>
              </>
            )}
          </TouchableOpacity>
          {sys?.configured && (
            <TouchableOpacity onPress={testConn} style={[s.testBtn, testing && { opacity: 0.5 }]} disabled={testing}>
              {testing ? <ActivityIndicator color="#0F172A" /> : (
                <>
                  <Ionicons name="pulse" size={16} color="#0F172A" />
                  <Text style={s.testTxt}>Tester connexion</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {sys?.configured && (
          <TouchableOpacity onPress={deleteConfig} style={s.deleteBtn}>
            <Ionicons name="trash" size={16} color="#DC2626" />
            <Text style={s.deleteTxt}>Supprimer cette configuration</Text>
          </TouchableOpacity>
        )}

        <Text style={s.disclaimer}>
          🔒 Les credentials sont chiffrés au repos (AES-256).{"\n"}
          Fournissez la vraie URL et le token dès que le ministère les partage.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 60 },
  head: { marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  subtitle: { color: "#64748B", fontSize: 13, marginTop: 4, lineHeight: 18 },
  protoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  protoBadge: { backgroundColor: "#EC4899", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  protoTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  docsLink: { color: "#EC4899", fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 12 },
  sectionTitle: { fontWeight: "800", fontSize: 14, color: "#111", marginBottom: 8 },
  label: { fontWeight: "700", color: "#334155", fontSize: 12, marginTop: 8, marginBottom: 4 },
  inp: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: "#111" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  resChip: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#FCE7F3", borderRadius: 999 },
  resChipTxt: { color: "#831843", fontSize: 11, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  saveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EC4899", paddingVertical: 12, borderRadius: 999 },
  saveTxt: { color: "#fff", fontWeight: "800" },
  testBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F1F5F9", paddingVertical: 12, borderRadius: 999 },
  testTxt: { color: "#0F172A", fontWeight: "800" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FEE2E2", paddingVertical: 12, borderRadius: 999, marginBottom: 14 },
  deleteTxt: { color: "#DC2626", fontWeight: "800" },
  disclaimer: { fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 16, paddingHorizontal: 12 },
});
