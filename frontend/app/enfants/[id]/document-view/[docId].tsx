/**
 * Visionneuse de document du carnet enfant — affiche PDF/Image, partage natif sinon.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { api, formatError } from "../../../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../../../constants/theme";

const TYPES: Record<string, { label: string; color: string; icon: string }> = {
  ordonnance: { label: "Ordonnance", color: "#3B82F6", icon: "📄" },
  analyse: { label: "Analyse / Bilan", color: "#10B981", icon: "🧪" },
  echo: { label: "Échographie", color: "#A855F7", icon: "🩻" },
  vaccin: { label: "Vaccins", color: "#F472B6", icon: "💉" },
  autre: { label: "Autre", color: "#6B7280", icon: "📁" },
};

const formatKb = (kb?: number) => {
  if (!kb) return "—";
  if (kb < 1024) return `${kb} ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
};

// Extrait { mime, raw } depuis un data URI ou une string base64 brute
function parseBase64(input: string): { mime: string; raw: string } {
  if (!input) return { mime: "application/octet-stream", raw: "" };
  const m = input.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], raw: m[2] };
  return { mime: "application/octet-stream", raw: input };
}

export default function ChildDocumentViewer() {
  const router = useRouter();
  const { id, docId } = useLocalSearchParams<{ id: string; docId: string }>();
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !docId) return;
    (async () => {
      try {
        const r = await api.get(`/enfants/${id}/documents/${docId}`);
        setDoc(r.data);
      } catch (e: any) {
        Alert.alert("Erreur", formatError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, docId]);

  const downloadOrShare = async () => {
    if (!doc?.file_base64) return;
    const { mime, raw } = parseBase64(doc.file_base64);
    try {
      if (Platform.OS === "web") {
        const byteChars = atob(raw);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = mime.includes("pdf") ? "pdf" : mime.split("/")[1] || "bin";
        a.download = `${doc.nom || "document"}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } else {
        const FileSystem = await import("expo-file-system/legacy");
        const Sharing = await import("expo-sharing");
        const ext = mime.includes("pdf") ? "pdf" : (mime.split("/")[1] || "bin");
        const fileName = `${(doc.nom || "document").replace(/\s+/g, "_")}.${ext}`;
        const localUri = (FileSystem.cacheDirectory || "") + fileName;
        await FileSystem.writeAsStringAsync(localUri, raw, { encoding: FileSystem.EncodingType.Base64 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(localUri, {
            mimeType: mime,
            dialogTitle: doc.nom,
            UTI: mime.includes("pdf") ? "com.adobe.pdf" : undefined,
          });
        } else {
          Alert.alert("Partage indisponible", "Le fichier a été sauvegardé dans le cache.");
        }
      }
    } catch (e: any) {
      console.warn("Download/share error", e);
      Alert.alert("Erreur", "Impossible d'ouvrir/partager le fichier.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!doc) {
    return (
      <SafeAreaView style={styles.loading}>
        <Ionicons name="alert-circle" size={48} color="#EF4444" />
        <Text style={{ color: "#EF4444", fontWeight: "700", marginTop: 8 }}>Document introuvable</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { mime, raw } = parseBase64(doc.file_base64 || "");
  const isPdf = mime.includes("pdf");
  const isImage = mime.startsWith("image");
  // Pour affichage : on garantit un data URI complet
  const dataUri = doc.file_base64?.startsWith("data:")
    ? doc.file_base64
    : `data:${mime};base64,${doc.file_base64 || ""}`;
  const t = TYPES[doc.type] || TYPES.autre;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{doc.nom}</Text>
          <Text style={styles.sub}>{t.label} · {formatKb(doc.size_kb)}</Text>
        </View>
        <TouchableOpacity onPress={downloadOrShare} style={styles.dlBtn}>
          <Ionicons name={Platform.OS === "web" ? "download" : "share-outline"} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Métadonnées */}
      <View style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Text style={{ fontSize: 18 }}>{t.icon}</Text>
          <Text style={[styles.metaText, { color: t.color, fontWeight: "800" }]}>{t.label}</Text>
        </View>
        {doc.created_at ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar" size={14} color={COLORS.textMuted} />
            <Text style={styles.metaText}>{new Date(doc.created_at).toLocaleDateString("fr-FR")}</Text>
          </View>
        ) : null}
        {doc.description ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Description</Text>
            <Text style={styles.notesText}>{doc.description}</Text>
          </View>
        ) : null}
      </View>

      {/* Visionneuse */}
      <View style={styles.viewer}>
        {isImage ? (
          <ScrollView contentContainerStyle={{ padding: SPACING.lg, alignItems: "center" }} maximumZoomScale={3} minimumZoomScale={1}>
            <Image source={{ uri: dataUri }} style={styles.image} resizeMode="contain" />
          </ScrollView>
        ) : isPdf ? (
          Platform.OS === "web" ? (
            <iframe src={dataUri} style={{ flex: 1, border: 0, width: "100%", height: "100%" }} title={doc.nom} />
          ) : (
            // Sur natif : rendu PDF via PDF.js (Mozilla) — fonctionne sur iOS et Android
            <WebView
              source={{ html: pdfViewerHTML(raw) }}
              style={{ flex: 1 }}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="always"
              startInLoadingState
              renderLoading={() => <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />}
            />
          )
        ) : (
          <View style={styles.unknownCard}>
            <Ionicons name="document-attach" size={64} color={COLORS.textMuted} />
            <Text style={styles.unknownTitle}>{doc.nom || "Fichier"}</Text>
            <Text style={styles.unknownText}>Ce type de fichier ne peut pas être affiché directement.</Text>
            <TouchableOpacity onPress={downloadOrShare} style={{ marginTop: 16 }}>
              <LinearGradient colors={["#14B8A6", "#06B6D4"]} style={styles.unknownBtn}>
                <Ionicons name={Platform.OS === "web" ? "download" : "share-outline"} size={18} color="#fff" />
                <Text style={styles.unknownBtnText}>{Platform.OS === "web" ? "Télécharger" : "Partager / Ouvrir"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// HTML qui affiche un PDF via PDF.js (Mozilla) — fonctionne sur Android & iOS
// On reçoit le base64 brut (sans préfixe data:) et on le décode dans la WebView
function pdfViewerHTML(rawBase64: string): string {
  const safe = (rawBase64 || "").replace(/\s+/g, "");
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body { margin:0; padding:0; background:#525659; }
  #viewer { padding: 8px 0; }
  canvas { display:block; margin: 6px auto; max-width: 98%; box-shadow: 0 2px 4px rgba(0,0,0,0.4); background: white; }
  .err { color:white; padding:24px; text-align:center; font-family:sans-serif; font-size:14px; }
  .loading { color:white; text-align:center; padding:30px; font-family:sans-serif; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
<div id="viewer"><div class="loading">Chargement du PDF…</div></div>
<script>
  (function() {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      var b64 = "${safe}";
      var bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      pdfjsLib.getDocument({ data: arr }).promise.then(async function(pdf) {
        var viewer = document.getElementById('viewer');
        viewer.innerHTML = '';
        for (var p = 1; p <= pdf.numPages; p++) {
          var page = await pdf.getPage(p);
          var vp = page.getViewport({ scale: 1.5 });
          var canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          viewer.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
      }).catch(function(e) {
        document.body.innerHTML = '<div class="err">❌ Erreur de lecture du PDF<br><br>' + (e && e.message ? e.message : e) + '<br><br>Utilisez le bouton « Partager » en haut à droite.</div>';
      });
    } catch (e) {
      document.body.innerHTML = '<div class="err">❌ Erreur: ' + (e && e.message ? e.message : e) + '</div>';
    }
  })();
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary, padding: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  dlBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },

  metaCard: { marginHorizontal: SPACING.lg, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  notesBox: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  notesLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: "800", textTransform: "uppercase" },
  notesText: { fontSize: 12, color: COLORS.textPrimary, marginTop: 2, lineHeight: 16 },

  viewer: { flex: 1, backgroundColor: "#f3f4f6", marginTop: 4 },
  image: { width: "100%", aspectRatio: 0.7, maxWidth: 600 },

  unknownCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  unknownTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginTop: 16, textAlign: "center" },
  unknownText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 8, textAlign: "center" },
  unknownBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS.pill },
  unknownBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
