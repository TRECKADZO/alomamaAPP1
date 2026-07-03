/**
 * Configuration DHIS2 — Super admin uniquement
 * Enregistre : URL instance, credentials, orgUnit UID, dataset UID, mappings dataElement.
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "../../../lib/api";

type Ind = { uid: string; code: string; name: string; category: string };

export default function DHIS2ConfigScreen() {
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [orgUnitUid, setOrgUnitUid] = useState("");
  const [datasetUid, setDatasetUid] = useState("ALM0DATASET");
  const [useToken, setUseToken] = useState(true);
  const [indicators, setIndicators] = useState<Ind[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, inds] = await Promise.all([
          api.get("/dhis2/config"),
          api.get("/dhis2/indicators"),
        ]);
        if (cfg.data?.configured) {
          setBaseUrl(cfg.data.base_url || "");
          setUsername(cfg.data.username || "");
          setOrgUnitUid(cfg.data.org_unit_uid || "");
          setDatasetUid(cfg.data.dataset_uid || "ALM0DATASET");
          setUseToken(!!cfg.data.has_token);
        }
        setIndicators(inds.data?.indicators || []);
      } catch (e: any) {
        Alert.alert("Erreur", e?.response?.data?.detail || "Impossible de charger la configuration.");
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    if (!baseUrl.trim()) { Alert.alert("Champ requis", "URL DHIS2 obligatoire."); return; }
    setSaving(true);
    try {
      const payload: any = {
        base_url: baseUrl.trim(),
        org_unit_uid: orgUnitUid.trim(),
        dataset_uid: datasetUid.trim(),
        element_mapping: mapping,
      };
      if (useToken) {
        if (apiToken.trim()) payload.api_token = apiToken.trim();
      } else {
        payload.username = username.trim();
        if (password.trim()) payload.password = password.trim();
      }
      await api.post("/dhis2/config", payload);
      Alert.alert("✅ Enregistré", "Configuration DHIS2 sauvegardée.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail || "Échec de l'enregistrement.");
    } finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.title}>🌐 Instance DHIS2</Text>
          <Text style={s.help}>URL du serveur DHIS2 du Ministère de la Santé.</Text>
          <Text style={s.label}>URL de base *</Text>
          <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="https://dhis2.msp.ci" placeholderTextColor="#94A3B8" style={s.inp} autoCapitalize="none" keyboardType="url" />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <Text style={s.label}>Authentification par API Token (recommandé)</Text>
            <Switch value={useToken} onValueChange={setUseToken} />
          </View>

          {useToken ? (
            <>
              <Text style={s.label}>Personal Access Token DHIS2</Text>
              <TextInput value={apiToken} onChangeText={setApiToken} placeholder="Laissez vide pour ne pas modifier" placeholderTextColor="#94A3B8" style={s.inp} secureTextEntry autoCapitalize="none" />
              <Text style={s.helpSm}>Générez le token via DHIS2 → Profil → Personal access tokens.</Text>
            </>
          ) : (
            <>
              <Text style={s.label}>Username</Text>
              <TextInput value={username} onChangeText={setUsername} placeholder="admin" placeholderTextColor="#94A3B8" style={s.inp} autoCapitalize="none" />
              <Text style={s.label}>Mot de passe</Text>
              <TextInput value={password} onChangeText={setPassword} placeholder="Laissez vide pour ne pas modifier" placeholderTextColor="#94A3B8" style={s.inp} secureTextEntry />
            </>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.title}>🏢 OrgUnit & DataSet</Text>
          <Text style={s.help}>UIDs propres à l'instance DHIS2 CI (11 caractères alphanumériques).</Text>
          <Text style={s.label}>OrgUnit UID (unité organisationnelle CI)</Text>
          <TextInput value={orgUnitUid} onChangeText={setOrgUnitUid} placeholder="ex. abc12def34G" placeholderTextColor="#94A3B8" style={s.inp} autoCapitalize="characters" />

          <Text style={s.label}>DataSet UID</Text>
          <TextInput value={datasetUid} onChangeText={setDatasetUid} placeholder="ALM0DATASET" placeholderTextColor="#94A3B8" style={s.inp} autoCapitalize="characters" />
        </View>

        <View style={s.card}>
          <Text style={s.title}>🔗 Mappings dataElement</Text>
          <Text style={s.help}>Associez chaque indicateur À lo Maman à un UID dataElement DHIS2 CI.{"\n"}Laisser vide = utiliser l'UID À lo Maman par défaut.</Text>
          {indicators.map((ind) => (
            <View key={ind.uid} style={s.mapRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.mapName}>{ind.name}</Text>
                <Text style={s.mapCode}>{ind.uid}</Text>
              </View>
              <TextInput
                value={mapping[ind.uid] || ""}
                onChangeText={(v) => setMapping({ ...mapping, [ind.uid]: v })}
                placeholder="UID DHIS2"
                placeholderTextColor="#94A3B8"
                style={s.mapInp}
                autoCapitalize="characters"
                maxLength={11}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={save} style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={s.saveTxt}>Enregistrer</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          🔒 Les identifiants sont chiffrés au repos (AES-256).{"\n"}
          Seul le super admin peut modifier cette configuration.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 60 },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 12 },
  title: { fontWeight: "800", fontSize: 15, color: "#111", marginBottom: 4 },
  help: { color: "#64748B", fontSize: 12, marginBottom: 10 },
  helpSm: { color: "#94A3B8", fontSize: 11, marginTop: 4, fontStyle: "italic" },
  label: { fontWeight: "700", color: "#334155", fontSize: 12, marginTop: 10, marginBottom: 4 },
  inp: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: "#111" },
  mapRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 8 },
  mapName: { fontSize: 12, color: "#0F172A", fontWeight: "600" },
  mapCode: { fontSize: 10, color: "#94A3B8", fontFamily: "monospace" },
  mapInp: { width: 130, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: "#111", fontFamily: "monospace" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EC4899", paddingVertical: 14, borderRadius: 999, marginTop: 8 },
  saveTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer: { fontSize: 11, color: "#94A3B8", padding: 12, textAlign: "center", lineHeight: 16 },
});
