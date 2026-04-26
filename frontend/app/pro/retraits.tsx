import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import PhoneInput, { extractLocalDigits } from "../../components/PhoneInput";

type Provider = { key: string; label: string; mode: string; country: string };
type Account = {
  provider?: string;
  account_alias?: string;
  holder_name?: string;
  debit_account_number?: string;
  updated_at?: string;
};
type Balance = {
  total_earned: number;
  total_withdrawn: number;
  available: number;
  min_withdraw_fcfa: number;
  fee_fixed_fcfa: number;
  fee_percent: number;
};
type Payout = {
  id: string;
  amount_fcfa: number;
  fee_fcfa: number;
  net_amount_fcfa: number;
  provider: string;
  account_alias: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
  completed_at?: string | null;
  error?: string | null;
};

export default function Retraits() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [account, setAccount] = useState<Account>({});
  const [balance, setBalance] = useState<Balance | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editProvider, setEditProvider] = useState<string>("");
  const [editAlias, setEditAlias] = useState<string>("");
  const [editHolder, setEditHolder] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");

  const load = async () => {
    try {
      const [p, a, b, h] = await Promise.all([
        api.get("/pro/mobile-money/providers"),
        api.get("/pro/mobile-money"),
        api.get("/pro/balance"),
        api.get("/pro/payouts"),
      ]);
      setProviders(p.data || []);
      setAccount(a.data || {});
      setBalance(b.data);
      setPayouts(h.data || []);
      if (a.data?.provider) setEditProvider(a.data.provider);
      if (a.data?.account_alias) setEditAlias(a.data.account_alias);
      if (a.data?.holder_name) setEditHolder(a.data.holder_name);
    } catch (e) {
      console.warn(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const saveAccount = async () => {
    if (!editProvider) {
      Alert.alert("Fournisseur requis", "Choisissez votre opérateur Mobile Money");
      return;
    }
    if (!editAlias.trim()) {
      Alert.alert("Numéro requis", "Entrez le numéro de téléphone Mobile Money");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post("/pro/mobile-money", {
        provider: editProvider,
        account_alias: editAlias.trim(),
        holder_name: editHolder.trim() || undefined,
      });
      setAccount(r.data);
      setEditing(false);
      Alert.alert("✅ Enregistré", "Votre compte Mobile Money a été enregistré.");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const requestWithdraw = () => {
    const amt = parseInt(withdrawAmount, 10);
    if (!balance) return;
    if (!amt || isNaN(amt)) {
      Alert.alert("Montant invalide", "Entrez un montant valide en FCFA");
      return;
    }
    if (amt < balance.min_withdraw_fcfa) {
      Alert.alert("Montant trop faible", `Minimum : ${balance.min_withdraw_fcfa.toLocaleString()} FCFA`);
      return;
    }
    if (amt > balance.available) {
      Alert.alert("Solde insuffisant", `Vous avez ${balance.available.toLocaleString()} FCFA disponibles`);
      return;
    }
    if (!account.provider || !account.account_alias) {
      Alert.alert("Compte manquant", "Configurez d'abord votre compte Mobile Money.");
      return;
    }
    const fee = balance.fee_fixed_fcfa + Math.round(amt * balance.fee_percent);
    const net = amt - fee;
    Alert.alert(
      "Confirmer le retrait",
      `Montant : ${amt.toLocaleString()} FCFA\nFrais : ${fee.toLocaleString()} FCFA\nVous recevrez : ${net.toLocaleString()} FCFA\n\nDestination : ${providers.find(p => p.key === account.provider)?.label || account.provider}\nNuméro : ${account.account_alias}`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", onPress: doWithdraw },
      ]
    );
  };

  const doWithdraw = async () => {
    const amt = parseInt(withdrawAmount, 10);
    setSubmitting(true);
    try {
      const r = await api.post("/pro/withdraw", { amount_fcfa: amt });
      if (r.data?.success) {
        Alert.alert(
          "🚀 Retrait envoyé",
          `${r.data.net_amount_fcfa?.toLocaleString()} FCFA en route vers votre Mobile Money.`,
        );
        setWithdrawAmount("");
        await load();
      } else {
        Alert.alert("Erreur", r.data?.error || "Échec du retrait");
        await load();
      }
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const providerLabel = (key?: string) => providers.find((p) => p.key === key)?.label || key || "—";
  const fee = balance ? balance.fee_fixed_fcfa + Math.round((parseInt(withdrawAmount, 10) || 0) * balance.fee_percent) : 0;
  const netSend = (parseInt(withdrawAmount, 10) || 0) - fee;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Retraits Mobile Money</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={["#059669", "#047857"]} style={styles.hero}>
            <Ionicons name="wallet" size={32} color="#fff" />
            <Text style={styles.heroLabel}>Solde disponible</Text>
            <Text style={styles.heroValue}>
              {(balance?.available || 0).toLocaleString()} <Text style={styles.heroUnit}>FCFA</Text>
            </Text>
            <View style={styles.heroSubRow}>
              <Text style={styles.heroSub}>Total gagné : {(balance?.total_earned || 0).toLocaleString()} F</Text>
              <Text style={styles.heroSub}>Retiré : {(balance?.total_withdrawn || 0).toLocaleString()} F</Text>
            </View>
          </LinearGradient>

          {/* Compte Mobile Money */}
          <Text style={styles.sectionTitle}>Mon compte Mobile Money</Text>
          {account.provider && !editing ? (
            <View style={styles.accountCard}>
              <View style={styles.accountRow}>
                <Ionicons name="phone-portrait" size={28} color={COLORS.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.accountProvider}>{providerLabel(account.provider)}</Text>
                  <Text style={styles.accountPhone}>{account.account_alias}</Text>
                  {account.holder_name ? <Text style={styles.accountHolder}>{account.holder_name}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
                  <Ionicons name="pencil" size={16} color={COLORS.primary} />
                  <Text style={styles.editBtnText}>Modifier</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.accountCard}>
              <Text style={styles.formLabel}>Opérateur</Text>
              <TouchableOpacity style={styles.input} onPress={() => setPickerOpen(true)}>
                <Text style={[styles.inputText, !editProvider && { color: COLORS.textMuted }]}>
                  {providerLabel(editProvider) || "Choisir un opérateur"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <Text style={styles.formLabel}>Numéro de téléphone</Text>
              <PhoneInput
                value={editAlias}
                onChangeText={setEditAlias}
                testID="retrait-phone-input"
              />

              <Text style={styles.formLabel}>Nom du titulaire (optionnel)</Text>
              <TextInput
                value={editHolder}
                onChangeText={setEditHolder}
                placeholder="Tel qu'enregistré chez l'opérateur"
                style={[styles.input, { paddingVertical: 12 }]}
                placeholderTextColor={COLORS.textMuted}
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                {account.provider && (
                  <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.bgSecondary }]} onPress={() => setEditing(false)}>
                    <Text style={[styles.btnText, { color: COLORS.textPrimary }]}>Annuler</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.btn, { flex: 1, backgroundColor: COLORS.primary }]}
                  onPress={saveAccount}
                  disabled={submitting}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Enregistrer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Demande de retrait */}
          {account.provider && !editing && (
            <>
              <Text style={styles.sectionTitle}>Demander un retrait</Text>
              <View style={styles.accountCard}>
                <Text style={styles.formLabel}>Montant à retirer (FCFA)</Text>
                <TextInput
                  value={withdrawAmount}
                  onChangeText={(t) => setWithdrawAmount(t.replace(/\D/g, ""))}
                  placeholder={`Min ${balance?.min_withdraw_fcfa.toLocaleString()} F · Max ${balance?.available.toLocaleString()} F`}
                  keyboardType="number-pad"
                  style={[styles.input, { paddingVertical: 14, fontSize: 18, fontWeight: "700" }]}
                  placeholderTextColor={COLORS.textMuted}
                />

                {!!withdrawAmount && parseInt(withdrawAmount, 10) > 0 && (
                  <View style={styles.summary}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Montant débité du solde</Text>
                      <Text style={styles.summaryVal}>{parseInt(withdrawAmount, 10).toLocaleString()} F</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Frais ({(balance?.fee_percent || 0) * 100}% + {balance?.fee_fixed_fcfa} F)</Text>
                      <Text style={[styles.summaryVal, { color: "#DC2626" }]}>-{fee.toLocaleString()} F</Text>
                    </View>
                    <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, marginTop: 4 }]}>
                      <Text style={[styles.summaryLabel, { fontWeight: "800", color: COLORS.textPrimary }]}>Vous recevrez</Text>
                      <Text style={[styles.summaryVal, { color: "#059669", fontSize: 18 }]}>
                        {netSend > 0 ? netSend.toLocaleString() : 0} F
                      </Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: "#059669", marginTop: 14 }]}
                  onPress={requestWithdraw}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={styles.btnText}>Envoyer vers Mobile Money</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Historique */}
          <Text style={styles.sectionTitle}>Historique des retraits</Text>
          {payouts.length === 0 ? (
            <Text style={styles.empty}>Aucun retrait pour le moment</Text>
          ) : (
            payouts.map((p) => (
              <View key={p.id} style={styles.payoutRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(p.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutAmount}>
                    {p.net_amount_fcfa.toLocaleString()} F · {providerLabel(p.provider)}
                  </Text>
                  <Text style={styles.payoutMeta}>
                    {new Date(p.created_at).toLocaleDateString("fr-FR")} · {p.account_alias}
                  </Text>
                  {p.error ? <Text style={styles.payoutError}>⚠️ {p.error}</Text> : null}
                </View>
                <Text style={[styles.payoutStatus, { color: statusColor(p.status) }]}>{statusLabel(p.status)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Provider picker */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choisir l'opérateur</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {providers.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.providerRow, editProvider === p.key && { backgroundColor: COLORS.bgSecondary }]}
                  onPress={() => {
                    setEditProvider(p.key);
                    setPickerOpen(false);
                  }}
                >
                  <Ionicons name="phone-portrait" size={20} color={COLORS.primary} />
                  <Text style={styles.providerLabel}>{p.label}</Text>
                  {editProvider === p.key && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function statusColor(s: string) {
  switch (s) {
    case "completed":
      return "#059669";
    case "processing":
    case "pending":
      return "#F59E0B";
    case "failed":
      return "#DC2626";
    default:
      return COLORS.textMuted;
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "completed":
      return "Reçu ✓";
    case "processing":
      return "En cours…";
    case "pending":
      return "En attente";
    case "failed":
      return "Échec";
    default:
      return s;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.xl, paddingBottom: 0 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },

  hero: { padding: 20, borderRadius: RADIUS.lg, alignItems: "center", marginBottom: 16 },
  heroLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700", marginTop: 8 },
  heroValue: { color: "#fff", fontSize: 34, fontWeight: "800" },
  heroUnit: { fontSize: 14, fontWeight: "700" },
  heroSubRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" },

  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary, marginTop: 14, marginBottom: 8 },
  empty: { color: COLORS.textMuted, textAlign: "center", padding: 20 },

  accountCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  accountRow: { flexDirection: "row", alignItems: "center" },
  accountProvider: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  accountPhone: { fontSize: 16, fontWeight: "800", color: COLORS.primary, marginTop: 2 },
  accountHolder: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORS.bgSecondary },
  editBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },

  formLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 10, marginBottom: 6 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    color: COLORS.textPrimary,
  },
  inputText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },

  summary: { marginTop: 12, padding: 10, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.sm },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  summaryVal: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },

  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: RADIUS.md },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  payoutRow: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6, gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  payoutAmount: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary },
  payoutMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  payoutError: { fontSize: 11, color: "#DC2626", marginTop: 2 },
  payoutStatus: { fontSize: 12, fontWeight: "800" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 12 },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  providerLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
});
