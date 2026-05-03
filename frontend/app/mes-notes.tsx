/**
 * 📝 Mes notes médicales — Vue unifiée pour la maman
 * Affiche TOUTES les notes reçues : ses notes personnelles + celles de ses enfants.
 */
import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

function parseDataUri(input?: string | null): { mime: string; raw: string } {
  if (!input) return { mime: "application/octet-stream", raw: "" };
  const m = input.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], raw: m[2] };
  return { mime: "application/octet-stream", raw: input };
}

async function openAttachment(dataUri: string, name: string) {
  try {
    const { mime, raw } = parseDataUri(dataUri);
    if (Platform.OS === "web") {
      const byteChars = atob(raw);
      const arr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) arr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || "piece_jointe";
      a.target = "_blank";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } else {
      const Sharing = await import("expo-sharing");
      const ext = mime.includes("pdf") ? "pdf" : (mime.split("/")[1] || "bin");
      const fileName = `${(name || "piece_jointe").replace(/\s+/g, "_").replace(/\.[^.]+$/, "")}.${ext}`;
      const localUri = (FileSystem.cacheDirectory || "") + fileName;
      await FileSystem.writeAsStringAsync(localUri, raw, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, { mimeType: mime, dialogTitle: name, UTI: mime.includes("pdf") ? "com.adobe.pdf" : undefined });
      }
    }
  } catch {
    Alert.alert("Erreur", "Impossible d'ouvrir la pièce jointe.");
  }
}

export default function MesNotes() {
  const router = useRouter();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/mes-consultation-notes");
      setNotes(r.data || []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📝 Mes notes médicales</Text>
          <Text style={styles.sub}>{notes.length} note{notes.length > 1 ? "s" : ""} reçue{notes.length > 1 ? "s" : ""}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {notes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune note pour le moment</Text>
            <Text style={styles.emptyText}>
              Les notes signées par les professionnels après vos consultations et celles de vos enfants apparaîtront ici.
            </Text>
          </View>
        ) : notes.map((n) => {
          const isEnfant = !!n.enfant_id;
          return (
            <View key={n.id} style={[styles.card, isEnfant && { borderLeftWidth: 4, borderLeftColor: "#EC4899" }]}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <View style={styles.proRow}>
                    <View style={styles.proAvatar}><Text style={styles.proAvatarTxt}>👨‍⚕️</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.proName}>Dr {n.pro_name || "Inconnu"}</Text>
                      {n.pro_specialite ? <Text style={styles.proSpec}>{n.pro_specialite}</Text> : null}
                    </View>
                  </View>
                </View>
                <Text style={styles.date}>{(n.date || n.created_at) ? new Date(n.date || n.created_at).toLocaleDateString("fr-FR") : ""}</Text>
              </View>

              {/* Badge concerné */}
              <View style={[styles.badge, isEnfant ? styles.badgeEnfant : styles.badgeMaman]}>
                <Text style={styles.badgeIcon}>{isEnfant ? "👶" : "👩"}</Text>
                <Text style={styles.badgeText}>
                  {isEnfant ? `Concerne : ${n.enfant_nom || "votre enfant"}` : "Concerne : vous"}
                </Text>
              </View>

              {n.diagnostic ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Diagnostic</Text>
                  <Text style={styles.fieldText}>{n.diagnostic}</Text>
                </View>
              ) : null}
              {n.traitement ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Traitement / Ordonnance</Text>
                  <Text style={styles.fieldText}>{n.traitement}</Text>
                </View>
              ) : null}
              {n.notes ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Observations</Text>
                  <Text style={styles.fieldText}>{n.notes}</Text>
                </View>
              ) : null}

              {/* 📎 Pièce jointe */}
              {n.attachment_base64 ? (
                <TouchableOpacity
                  onPress={() => openAttachment(n.attachment_base64, n.attachment_name || "piece_jointe")}
                  style={styles.attachmentChip}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-attach" size={18} color="#EC4899" />
                  <Text style={styles.attachmentText} numberOfLines={1}>{n.attachment_name || "Pièce jointe"}</Text>
                  <Ionicons name={Platform.OS === "web" ? "download-outline" : "open-outline"} size={16} color="#EC4899" />
                </TouchableOpacity>
              ) : null}

              <View style={styles.signBadge}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={styles.signText}>Note signée — Dr {n.pro_name || ""}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border, marginRight: 10 },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  empty: { padding: 40, alignItems: "center", marginTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 18 },

  card: { padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  proRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  proAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FCE7F3", alignItems: "center", justifyContent: "center" },
  proAvatarTxt: { fontSize: 18 },
  proName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  proSpec: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.textMuted, fontWeight: "600" },

  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: "flex-start", marginBottom: 12 },
  badgeMaman: { backgroundColor: "#DBEAFE" },
  badgeEnfant: { backgroundColor: "#FCE7F3" },
  badgeIcon: { fontSize: 14 },
  badgeText: { fontSize: 11, fontWeight: "800", color: COLORS.textPrimary },

  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: "#EC4899", textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 },
  fieldText: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 18 },

  attachmentChip: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "#FCE7F3", borderWidth: 1, borderColor: "#FBCFE8", marginVertical: 8 },
  attachmentText: { flex: 1, fontSize: 13, color: "#9D174D", fontWeight: "600" },

  signBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  signText: { fontSize: 10, color: "#059669", fontWeight: "700" },
});
