import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueue, useOnlineStatus, flushQueue, removeQueueItem, clearQueue, QueueItem } from "../lib/offline";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const PATH_LABELS: Record<string, string> = {
  "/grossesse": "🤰 Grossesse",
  "/enfants": "👶 Enfant",
  "/rdv": "📅 Rendez-vous",
  "/cycle": "🌸 Cycle",
  "/contraception": "💊 Contraception",
  "/reminders": "⏰ Rappel",
  "/community": "💬 Post communauté",
  "/messages": "💌 Message",
  "/tele-echo": "🩻 Télé-échographie",
};

function describeItem(item: QueueItem): string {
  const path = item.path.replace(/\/[a-f0-9-]{8,}/gi, "/…");
  for (const k of Object.keys(PATH_LABELS)) {
    if (item.path.startsWith(k)) {
      const action = item.method === "post" ? "Création" : item.method === "patch" ? "Mise à jour" : "Suppression";
      return `${PATH_LABELS[k]} — ${action}`;
    }
  }
  return `${item.method.toUpperCase()} ${path}`;
}

export default function SyncScreen() {
  const router = useRouter();
  const { items, refresh } = useQueue();
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: number; failed: number } | null>(null);

  const onSyncNow = async () => {
    if (!online) {
      Alert.alert("Hors ligne", "Connectez-vous à internet pour synchroniser.");
      return;
    }
    setBusy(true);
    try {
      const r = await flushQueue();
      setLastResult(r);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (item: QueueItem) => {
    Alert.alert(
      "Supprimer cette action ?",
      "Cette action sera définitivement abandonnée et ne sera pas envoyée au serveur.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => { await removeQueueItem(item.id); refresh(); },
        },
      ]
    );
  };

  const onClearAll = () => {
    Alert.alert(
      "Vider la file ?",
      `${items.length} action(s) seront supprimées et ne seront pas envoyées au serveur.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Tout vider", style: "destructive", onPress: async () => { await clearQueue(); refresh(); } },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Synchronisation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {/* Status card */}
        <View style={[styles.statusCard, { backgroundColor: online ? "#DCFCE7" : "#FEE2E2" }]}>
          <Ionicons
            name={online ? "cloud-done" : "cloud-offline"}
            size={28}
            color={online ? "#16A34A" : "#DC2626"}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: online ? "#15803D" : "#991B1B" }]}>
              {online ? "En ligne" : "Hors ligne"}
            </Text>
            <Text style={styles.statusSub}>
              {online
                ? items.length === 0
                  ? "Toutes vos données sont synchronisées."
                  : `${items.length} action(s) en attente de synchronisation.`
                : "Vos saisies sont enregistrées localement et seront envoyées dès le retour de la connexion."}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        {items.length > 0 && (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btnPrimary, (!online || busy) && styles.btnDisabled]}
              onPress={onSyncNow}
              disabled={!online || busy}
              testID="sync-now-btn"
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="sync" size={18} color="#fff" />}
              <Text style={styles.btnPrimaryText}>{busy ? "Synchronisation..." : "Synchroniser maintenant"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={onClearAll} testID="clear-queue-btn">
              <Ionicons name="trash" size={16} color="#DC2626" />
              <Text style={styles.btnSecondaryText}>Tout vider</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Last sync result */}
        {lastResult && (
          <View style={styles.resultBox}>
            <Ionicons name="information-circle" size={16} color={COLORS.primary} />
            <Text style={styles.resultText}>
              ✓ {lastResult.ok} synchronisée(s) · {lastResult.failed > 0 ? `⚠ ${lastResult.failed} échouée(s) (réessai automatique)` : "Aucune erreur"}
            </Text>
          </View>
        )}

        {/* Empty state */}
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={60} color="#16A34A" />
            <Text style={styles.emptyTitle}>Tout est synchronisé ✨</Text>
            <Text style={styles.emptyText}>
              Aucune action en attente. Toutes vos données ont été envoyées au serveur.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Actions en attente ({items.length})</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{describeItem(item)}</Text>
                  <Text style={styles.itemMeta}>
                    {new Date(item.ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {item.tries > 0 ? ` · ${item.tries} tentative(s)` : ""}
                  </Text>
                  {item.lastError ? (
                    <Text style={styles.itemError} numberOfLines={2}>⚠ {item.lastError}</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => onDelete(item)} style={styles.itemDeleteBtn} testID={`delete-${item.id}`}>
                  <Ionicons name="close" size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Help */}
        <View style={styles.helpBox}>
          <Ionicons name="help-circle-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.helpText}>
            Lorsque vous saisissez des données sans connexion, elles sont conservées en sécurité sur votre téléphone.
            Dès que la connexion revient, elles sont automatiquement envoyées au serveur.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.xl, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: RADIUS.lg, marginBottom: 14 },
  statusTitle: { fontSize: 16, fontWeight: "800" },
  statusSub: { color: COLORS.textPrimary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  btnRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  btnPrimary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.pill },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", paddingVertical: 12, paddingHorizontal: 14, borderRadius: RADIUS.pill },
  btnSecondaryText: { color: "#DC2626", fontWeight: "800", fontSize: 12 },
  resultBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight, marginBottom: 14 },
  resultText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  emptyText: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginBottom: 10 },
  itemCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, ...SHADOW.sm },
  itemTitle: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 14 },
  itemMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  itemError: { color: "#DC2626", fontSize: 11, marginTop: 4, fontStyle: "italic" },
  itemDeleteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" },
  helpBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 20 },
  helpText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 16, flex: 1 },
});
