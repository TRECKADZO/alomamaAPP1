import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function Teleconsultation() {
  const { rdvId } = useLocalSearchParams<{ rdvId: string }>();
  const router = useRouter();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createRoom = async () => {
    if (!rdvId) return Alert.alert("Erreur", "RDV manquant");
    setLoading(true);
    try {
      const { data } = await api.post(`/teleconsultation/room/${rdvId}`);
      setRoomUrl(data.room_url);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };

  if (roomUrl && Platform.OS === "web") {
    // On web, ouvre dans un nouvel onglet
    Linking.openURL(roomUrl);
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl }}>
          <Ionicons name="videocam" size={64} color="#06B6D4" />
          <Text style={styles.bigTitle}>Téléconsultation en cours</Text>
          <Text style={styles.bigSub}>La salle s'est ouverte dans un nouvel onglet.</Text>
          <TouchableOpacity onPress={() => Linking.openURL(roomUrl)} style={{ marginTop: 20 }}>
            <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btn}>
              <Text style={styles.btnText}>Rejoindre à nouveau</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Téléconsultation</Text>
          <Text style={styles.sub}>Consultation vidéo sécurisée</Text>
        </View>
      </View>

      {!roomUrl ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl }}>
          <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.iconBig}>
            <Ionicons name="videocam" size={48} color="#fff" />
          </LinearGradient>
          <Text style={styles.bigTitle}>Prêt pour la consultation ?</Text>
          <Text style={styles.bigSub}>Créez la salle de téléconsultation pour commencer. La patiente recevra le lien.</Text>
          <TouchableOpacity onPress={createRoom} disabled={loading} style={{ marginTop: 24 }}>
            <LinearGradient colors={["#2DD4BF", "#06B6D4"]} style={styles.btn}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="videocam" size={18} color="#fff" />
                  <Text style={styles.btnText}>Démarrer la consultation</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          source={{ uri: roomUrl }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  iconBig: { width: 96, height: 96, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  bigTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center", marginTop: 16 },
  bigSub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginTop: 8, paddingHorizontal: 20 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: RADIUS.pill },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
