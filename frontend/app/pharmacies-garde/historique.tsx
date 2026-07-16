/**
 * Route /pharmacies-garde/historique — Historique personnel de la maman.
 * Liste les pharmacies consultées / appelées récemment.
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api } from "../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";

type HistoryEntry = {
  pharmacie_id: string;
  action: string;
  at: string;
  snapshot: {
    id: string;
    nom: string;
    commune: string;
    zone: string;
    telephone_primary: string | null;
  };
};

const ACTION_LABELS: Record<string, { icon: any; color: string; label: string }> = {
  view: { icon: "eye", color: "#6366F1", label: "Consultée" },
  call: { icon: "call", color: "#16A34A", label: "Appelée" },
  directions: { icon: "navigate", color: "#3B82F6", label: "Itinéraire" },
};

export default function HistoriquePharmacies() {
  const router = useRouter();
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/pharmacies/garde/me/history");
        setItems(r.data?.items || []);
      } catch {
        setItems([]);
      } finally { setLoading(false); }
    })();
  }, []);

  const callPhone = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#16A34A", "#059669"]} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>📋 Mon historique</Text>
            <Text style={styles.headerSub}>Pharmacies de garde récentes</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }}>
        {loading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color="#16A34A" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="time-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune pharmacie consultée</Text>
            <Text style={styles.emptyText}>
              Consultez une pharmacie de garde depuis la liste et elle apparaîtra ici.
            </Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push("/pharmacies-garde" as any)}
            >
              <Text style={styles.ctaBtnText}>Voir les pharmacies</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((h) => {
            const meta = ACTION_LABELS[h.action] || ACTION_LABELS.view;
            const s = h.snapshot || ({} as any);
            return (
              <TouchableOpacity
                key={`${h.pharmacie_id}-${h.at}`}
                style={styles.card}
                onPress={() => router.push(`/pharmacies-garde/${h.pharmacie_id}` as any)}
              >
                <View style={[styles.iconWrap, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>{s.nom || "Pharmacie"}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={11} color={COLORS.textSecondary} />
                    <Text style={styles.metaText} numberOfLines={1}>{s.commune}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <View style={[styles.actionBadge, { backgroundColor: meta.color }]}>
                      <Text style={styles.actionBadgeText}>{meta.label}</Text>
                    </View>
                    <Text style={styles.date}>
                      {new Date(h.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                </View>
                {s.telephone_primary && (
                  <TouchableOpacity
                    style={styles.callMini}
                    onPress={(e) => { e.stopPropagation(); callPhone(s.telephone_primary); }}
                    hitSlop={10}
                  >
                    <Ionicons name="call" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },

  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 10,
    ...SHADOW.sm,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 11, color: COLORS.textSecondary, flex: 1 },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  actionBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  date: { fontSize: 11, color: COLORS.textMuted, flex: 1, textAlign: "right" },
  callMini: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#16A34A",
    alignItems: "center", justifyContent: "center",
  },

  emptyWrap: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  emptyText: { fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },
  ctaBtn: {
    marginTop: 16,
    backgroundColor: "#16A34A",
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 999,
  },
  ctaBtnText: { color: "#fff", fontWeight: "800" },
});
