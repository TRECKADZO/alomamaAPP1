import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function VideoCall() {
  const { rid } = useLocalSearchParams<{ rid: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/rdv/${rid}/video-link`);
        const name = encodeURIComponent(user?.name || "Utilisateur");
        setUrl(`${data.url}#userInfo.displayName="${name}"&config.prejoinPageEnabled=false`);
      } catch (e: any) {
        Alert.alert("Erreur", e?.response?.data?.detail || "Impossible d'ouvrir la visioconférence");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [rid]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="video-back-btn">
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Consultation vidéo</Text>
          <Text style={styles.subtitle}>Powered by Jitsi</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Connexion en cours...</Text>
        </View>
      ) : url && Platform.OS !== "web" ? (
        <WebView
          source={{ uri: url }}
          style={{ flex: 1 }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : url && Platform.OS === "web" ? (
        <View style={styles.webFallback}>
          <Ionicons name="videocam" size={60} color="#fff" />
          <Text style={styles.fallbackTitle}>Ouvrir la visioconférence</Text>
          <Text style={styles.fallbackText}>Cliquez ci-dessous pour rejoindre la salle Jitsi dans un nouvel onglet.</Text>
          <TouchableOpacity
            style={styles.fallbackBtn}
            onPress={() => { if (typeof window !== "undefined") window.open(url, "_blank"); }}
          >
            <Text style={styles.fallbackBtnText}>Rejoindre</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  header: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: "#000" },
  title: { color: "#fff", fontWeight: "700", fontSize: 16 },
  subtitle: { color: "#9ca3af", fontSize: 11 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: "#fff", fontSize: 14 },
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 14 },
  fallbackTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  fallbackText: { color: "#d1d5db", textAlign: "center", lineHeight: 20 },
  fallbackBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: RADIUS.pill, marginTop: 10 },
  fallbackBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
