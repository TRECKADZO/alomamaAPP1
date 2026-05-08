/**
 * Visualiseur des documents de sécurité (PSSI / PAS / Analyse de risques)
 * Route: /security/docs?name=PSSI
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function SecurityDocs() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const [list, setList] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(name || null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadList = async () => {
    try { const r = await api.get("/security/docs"); setList(r.data.docs || []); }
    catch {}
  };

  const loadDoc = async (n: string) => {
    setLoading(true);
    try { const r = await api.get(`/security/docs/${n}`); setContent(r.data.content); }
    catch (e: any) { setContent("# Erreur\n\nImpossible de charger le document"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => { if (active) loadDoc(active); else setLoading(false); }, [active]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#6366F1", "#3B82F6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📋 Documents de sécurité</Text>
          <Text style={styles.sub}>RGSSI Niveau 3 — Référentiels officiels</Text>
        </View>
      </LinearGradient>

      {!active ? (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
          {list.map((d) => (
            <TouchableOpacity key={d.key} style={styles.docCard} onPress={() => setActive(d.key)}>
              <Text style={{ fontSize: 24 }}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.docTitle}>{d.label}</Text>
                <Text style={styles.docMeta}>Maj: {new Date(d.modified_at).toLocaleDateString("fr-FR")} · {Math.round(d.size_bytes / 1024)} KB</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <>
          <TouchableOpacity onPress={() => setActive(null)} style={styles.allDocs}>
            <Ionicons name="chevron-back" size={14} color={"#3B82F6"} />
            <Text style={styles.allDocsText}>Tous les documents</Text>
          </TouchableOpacity>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
              <Text style={styles.markdown}>{content}</Text>
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  docCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  docTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  docMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  allDocs: { flexDirection: "row", alignItems: "center", gap: 4, padding: 12, paddingHorizontal: SPACING.lg },
  allDocsText: { color: "#3B82F6", fontSize: 13, fontWeight: "700" },

  markdown: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 20, fontFamily: "monospace" },
});
