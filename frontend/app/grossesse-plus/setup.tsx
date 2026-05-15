import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import DateField from "../../components/DateField";

export default function GrossessePlusSetup() {
  const router = useRouter();
  const [source, setSource] = useState<"ddr" | "dpa" | "echographie">("ddr");
  const [dateDebut, setDateDebut] = useState("");
  const [dateTerme, setDateTerme] = useState("");
  const [parite, setParite] = useState("");
  const [groupe, setGroupe] = useState("");
  const [rhesus, setRhesus] = useState<"+" | "-" | "">("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (source === "ddr" && !dateDebut) return Alert.alert("Information manquante", "Veuillez renseigner votre date de dernières règles (DDR).");
    if ((source === "dpa" || source === "echographie") && !dateTerme) return Alert.alert("Information manquante", "Veuillez renseigner la date prévue d'accouchement.");
    try {
      setBusy(true);
      await api.post("/grossesse-plus/setup", {
        source,
        date_debut: source === "ddr" ? dateDebut : undefined,
        date_terme: source !== "ddr" ? dateTerme : (dateTerme || undefined),
        parite: parite ? parseInt(parite) : undefined,
        groupe_sanguin: groupe || undefined,
        rhesus: rhesus || undefined,
        consent_partage_pro: consent,
      });
      Alert.alert("✨ Configuration enregistrée", "Votre suivi Grossesse + démarre maintenant.", [{ text: "Voir mon tableau de bord", onPress: () => router.replace("/grossesse-plus" as any) }]);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Configurez votre grossesse</Text>
          <Text style={styles.sub}>Renseignez l'une des deux dates ci-dessous pour démarrer votre suivi personnalisé.</Text>

          <Text style={styles.label}>Comment souhaitez-vous démarrer ?</Text>
          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, source === "ddr" && styles.tabActive]} onPress={() => setSource("ddr")}>
              <Text style={[styles.tabTxt, source === "ddr" && styles.tabTxtActive]}>DDR</Text>
              <Text style={styles.tabSub}>Dernières règles</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, source === "dpa" && styles.tabActive]} onPress={() => setSource("dpa")}>
              <Text style={[styles.tabTxt, source === "dpa" && styles.tabTxtActive]}>DPA</Text>
              <Text style={styles.tabSub}>Date prévue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, source === "echographie" && styles.tabActive]} onPress={() => setSource("echographie")}>
              <Text style={[styles.tabTxt, source === "echographie" && styles.tabTxtActive]}>Écho</Text>
              <Text style={styles.tabSub}>Datation médicale</Text>
            </TouchableOpacity>
          </View>

          {source === "ddr" ? (
            <>
              <Text style={styles.label}>Date de vos dernières règles *</Text>
              <DateField value={dateDebut} onChange={setDateDebut} maximumDate={new Date()} placeholder="Sélectionner la DDR" />
              <Text style={styles.help}>La DPA sera calculée automatiquement (DDR + 280 jours).</Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Date prévue d'accouchement (DPA) *</Text>
              <DateField value={dateTerme} onChange={setDateTerme} placeholder="Sélectionner la DPA" />
              <Text style={styles.help}>{source === "echographie" ? "DPA donnée par votre médecin/sage-femme." : "Si donnée par votre médecin lors de l'écho."}</Text>
            </>
          )}

          <Text style={styles.label}>Nombre de grossesses précédentes</Text>
          <TextInput style={styles.input} value={parite} onChangeText={setParite} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />

          <Text style={styles.label}>Groupe sanguin (optionnel)</Text>
          <View style={styles.bloodRow}>
            {["O", "A", "B", "AB"].map((b) => (
              <TouchableOpacity key={b} style={[styles.blood, groupe === b && styles.bloodActive]} onPress={() => setGroupe(b)}>
                <Text style={[styles.bloodTxt, groupe === b && styles.bloodTxtActive]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.bloodRow, { marginTop: 8 }]}>
            {["+", "-"].map((r) => (
              <TouchableOpacity key={r} style={[styles.blood, rhesus === r && styles.bloodActive]} onPress={() => setRhesus(r as any)}>
                <Text style={[styles.bloodTxt, rhesus === r && styles.bloodTxtActive]}>Rh {r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.consentBox}>
            <Switch value={consent} onValueChange={setConsent} trackColor={{ false: COLORS.border, true: COLORS.primary }} thumbColor="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.consentTitle}>Partager mes données avec un professionnel</Text>
              <Text style={styles.consentTxt}>J'accepte que mes mesures et mon dossier de grossesse puissent être consultés par les professionnels que j'autoriserai via le partage de dossier.</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.btnTxt}>{busy ? "Enregistrement..." : "Démarrer mon suivi"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.lg, paddingBottom: 80 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 6 },
  sub: { color: COLORS.textSecondary, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center" },
  tabActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  tabTxt: { fontWeight: "800", color: COLORS.textPrimary },
  tabTxtActive: { color: COLORS.primary },
  tabSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, color: COLORS.textPrimary, fontSize: 15 },
  help: { color: COLORS.textMuted, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  bloodRow: { flexDirection: "row", gap: 8 },
  blood: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", backgroundColor: COLORS.surface },
  bloodActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  bloodTxt: { color: COLORS.textPrimary, fontWeight: "800" },
  bloodTxtActive: { color: COLORS.primary },
  consentBox: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14, marginTop: 16, backgroundColor: COLORS.bgSecondary, borderRadius: RADIUS.md },
  consentTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  consentTxt: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.pill, marginTop: 24 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
