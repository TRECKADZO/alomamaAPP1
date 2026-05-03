/**
 * 🤝 Page Parrainage Maman
 *   Affiche le code personnel, permet de partager, montre stats et paliers.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { COLORS, RADIUS, SPACING } from "../constants/theme";

export default function Parrainage() {
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/referral/me");
        setData(r.data);
      } catch (e: any) {
        Alert.alert("Erreur", "Impossible de charger votre code de parrainage.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyCode = async () => {
    if (!data?.referral_code) return;
    await Clipboard.setStringAsync(data.referral_code);
    Alert.alert("✓ Copié", `Votre code ${data.referral_code} est copié dans le presse-papier`);
  };

  const shareInvite = async () => {
    if (!data?.share_text) return;
    try {
      const msg = `${data.share_text}\n\n${data.share_url || ""}`.trim();
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(msg);
        Alert.alert("Message copié", "Collez-le dans WhatsApp, SMS, Messenger…");
      } else {
        await Share.share({ message: msg });
      }
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data?.referral_code) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={{ color: COLORS.textSecondary }}>Code indisponible</Text>
      </SafeAreaView>
    );
  }

  const count = data.referrals_count || 0;
  const next = data.next_milestone;
  const daysEarned = data.days_earned || 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>🤝 Parrainage</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Hero code */}
        <LinearGradient colors={["#EC4899", "#F472B6"]} style={styles.heroCard}>
          <Text style={styles.heroLabel}>Votre code de parrainage</Text>
          <Text style={styles.code}>{data.referral_code}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={styles.ctaBtn} onPress={copyCode}>
              <Ionicons name="copy-outline" size={18} color="#EC4899" />
              <Text style={styles.ctaText}>Copier</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaBtn} onPress={shareInvite}>
              <Ionicons name="share-social" size={18} color="#EC4899" />
              <Text style={styles.ctaText}>Partager</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{count}</Text>
            <Text style={styles.statLabel}>Filleule{count > 1 ? "s" : ""}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{daysEarned}</Text>
            <Text style={styles.statLabel}>Jours Premium gagnés</Text>
          </View>
        </View>

        {/* Prochain palier */}
        {next && (
          <View style={styles.nextCard}>
            <Ionicons name="trophy" size={28} color="#F59E0B" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.nextTitle}>Prochain palier : {next.label}</Text>
              <Text style={styles.nextText}>Plus que <Text style={{ fontWeight: "800", color: "#F59E0B" }}>{next.remaining}</Text> filleule{next.remaining > 1 ? "s" : ""} pour débloquer !</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (count / next.at) * 100)}%` }]} />
              </View>
            </View>
          </View>
        )}

        {/* Comment ça marche */}
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>💡 Comment ça marche</Text>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>1</Text>
            <Text style={styles.howText}>Partagez votre code <Text style={{ fontWeight: "800" }}>{data.referral_code}</Text> à vos amies enceintes ou mamans.</Text>
          </View>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>2</Text>
            <Text style={styles.howText}>Elles entrent votre code à l'inscription sur À lo Maman.</Text>
          </View>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>3</Text>
            <Text style={styles.howText}>Vous gagnez <Text style={{ fontWeight: "800", color: "#EC4899" }}>7 jours Premium</Text> par filleule !</Text>
          </View>
        </View>

        {/* Paliers */}
        <View style={styles.milestonesCard}>
          <Text style={styles.howTitle}>🏆 Paliers bonus</Text>
          {(data.rewards_info?.milestones || []).map((m: any, idx: number) => {
            const unlocked = count >= m.at;
            return (
              <View key={idx} style={styles.milestoneRow}>
                <Ionicons name={unlocked ? "checkmark-circle" : "lock-closed"} size={22} color={unlocked ? "#10B981" : COLORS.textMuted} />
                <Text style={[styles.milestoneText, unlocked && { color: "#10B981", fontWeight: "800" }]}>{m.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Liste filleules */}
        {count > 0 && (
          <View style={styles.filCard}>
            <Text style={styles.howTitle}>👭 Vos filleules ({count})</Text>
            {(data.filleules || []).map((f: any) => (
              <View key={f.id} style={styles.filRow}>
                <View style={styles.filAvatar}><Text style={{ fontWeight: "800", color: "#EC4899" }}>{(f.name || "?").charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filName}>{f.name}</Text>
                  <Text style={styles.filDate}>Inscrite {f.created_at ? new Date(f.created_at).toLocaleDateString("fr-FR") : ""}</Text>
                </View>
                <Ionicons name="heart" size={18} color="#EC4899" />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  heroCard: { borderRadius: RADIUS.xl, padding: 28, alignItems: "center" },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  code: { color: "#fff", fontSize: 46, fontWeight: "900", letterSpacing: 6 },
  ctaBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", paddingVertical: 10, borderRadius: 999 },
  ctaText: { color: "#EC4899", fontWeight: "800", fontSize: 13 },

  statsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  statCard: { flex: 1, padding: 18, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  statValue: { fontSize: 32, fontWeight: "900", color: "#EC4899" },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, textAlign: "center", fontWeight: "600" },

  nextCard: { marginTop: 16, padding: 14, backgroundColor: "#FFFBEB", borderRadius: RADIUS.lg, borderWidth: 1, borderColor: "#FDE68A", flexDirection: "row", alignItems: "center" },
  nextTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  nextText: { fontSize: 12, color: "#78350F", marginTop: 4 },
  progressBar: { marginTop: 8, height: 8, backgroundColor: "#FDE68A", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#F59E0B", borderRadius: 999 },

  howCard: { marginTop: 16, padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  howTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 12 },
  howRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 10 },
  howNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#EC4899", color: "#fff", textAlign: "center", lineHeight: 24, fontWeight: "800", fontSize: 13 },
  howText: { flex: 1, fontSize: 13, color: COLORS.textPrimary, lineHeight: 18 },

  milestonesCard: { marginTop: 14, padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  milestoneRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  milestoneText: { fontSize: 13, color: COLORS.textSecondary },

  filCard: { marginTop: 14, padding: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  filRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FCE7F3", alignItems: "center", justifyContent: "center" },
  filName: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  filDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
