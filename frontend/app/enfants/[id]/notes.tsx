/**
 * Notes médicales d'un enfant (lecture seule pour la maman)
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../../constants/theme";

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
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: mime });
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

export default function NotesEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api.get(`/enfants/${id}/notes`);
        setNotes(r.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📝 Notes médicales</Text>
          <Text style={styles.sub}>{notes.length} consultation{notes.length > 1 ? "s" : ""} signée{notes.length > 1 ? "s" : ""}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
        {notes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune note pour le moment</Text>
            <Text style={styles.emptyText}>Les notes signées par les professionnels après une consultation apparaîtront ici.</Text>
          </View>
        ) : notes.map((n) => (
          <View key={n.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.proName}>👨‍⚕️ Dr {n.pro_name || "Inconnu"}</Text>
                {n.pro_specialite && <Text style={styles.proSpec}>{n.pro_specialite}</Text>}
              </View>
              <Text style={styles.date}>{(n.date || n.created_at) ? new Date(n.date || n.created_at).toLocaleDateString("fr-FR") : ""}</Text>
            </View>
            {n.diagnostic && <View style={styles.field}><Text style={styles.fieldLabel}>Diagnostic</Text><Text style={styles.fieldText}>{n.diagnostic}</Text></View>}
            {n.traitement && <View style={styles.field}><Text style={styles.fieldLabel}>Traitement / Ordonnance</Text><Text style={styles.fieldText}>{n.traitement}</Text></View>}
            {n.notes && <View style={styles.field}><Text style={styles.fieldLabel}>Observations</Text><Text style={styles.fieldText}>{n.notes}</Text></View>}

            {/* 📎 Pièce jointe (si présente) */}
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
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: 30, marginTop: 6, lineHeight: 17 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#3B82F6" },
  cardHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  proName: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  proSpec: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600" },
  field: { marginTop: 8 },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textSecondary, textTransform: "uppercase" },
  fieldText: { fontSize: 13, color: COLORS.textPrimary, marginTop: 2, lineHeight: 18 },
  signBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  signText: { fontSize: 10, color: "#059669", fontWeight: "700" },
});
