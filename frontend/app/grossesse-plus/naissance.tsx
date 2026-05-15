import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import DateField from "../../components/DateField";

export default function DeclarerNaissance() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [sexe, setSexe] = useState<"F" | "M">("F");
  const [date, setDate] = useState("");
  const [poids, setPoids] = useState("");
  const [taille, setTaille] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!nom.trim()) return Alert.alert("Prénom requis");
    if (!date) return Alert.alert("Date de naissance requise");
    Alert.alert("🎉 Confirmer la naissance", `Cette action clôture votre grossesse et crée le carnet de ${nom}. Continuer ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Oui, c'est né !", onPress: async () => {
        try {
          setBusy(true);
          const r = await api.post("/grossesse-plus/declarer-naissance", {
            nom, sexe, date_naissance: date,
            poids_kg: poids ? parseFloat(poids) : undefined,
            taille_cm: taille ? parseFloat(taille) : undefined,
          });
          Alert.alert("🎉 Félicitations !", r.data.message, [{ text: "Voir le carnet", onPress: () => router.replace("/(tabs)/enfants" as any) }]);
        } catch (e) { Alert.alert("Erreur", formatError(e)); } finally { setBusy(false); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}>
          <View style={s.hero}>
            <Text style={{ fontSize: 60 }}>🎉</Text>
            <Text style={s.title}>Bienvenue à votre bébé !</Text>
            <Text style={s.sub}>Renseignez les informations de naissance. Le carnet de santé sera automatiquement créé.</Text>
          </View>

          <Text style={s.label}>Prénom *</Text>
          <TextInput style={s.input} value={nom} onChangeText={setNom} placeholder="Prénom du bébé" placeholderTextColor={COLORS.textMuted} />

          <Text style={s.label}>Sexe *</Text>
          <View style={s.row}>
            <TouchableOpacity style={[s.sex, sexe === "F" && s.sexOn]} onPress={() => setSexe("F")}>
              <Text style={[s.sexTxt, sexe === "F" && s.sexTxtOn]}>👧 Fille</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sex, sexe === "M" && s.sexOn]} onPress={() => setSexe("M")}>
              <Text style={[s.sexTxt, sexe === "M" && s.sexTxtOn]}>👦 Garçon</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.label}>Date et heure de naissance *</Text>
          <DateField value={date} onChange={setDate} maximumDate={new Date()} placeholder="Date de naissance" />

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Poids (kg)</Text>
              <TextInput style={s.input} value={poids} onChangeText={setPoids} keyboardType="decimal-pad" placeholder="3.2" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Taille (cm)</Text>
              <TextInput style={s.input} value={taille} onChangeText={setTaille} keyboardType="decimal-pad" placeholder="50" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>

          <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
            <Ionicons name="happy" size={20} color="#fff" />
            <Text style={s.btnTxt}>{busy ? "Création..." : "Déclarer la naissance"}</Text>
          </TouchableOpacity>

          <Text style={s.note}>⚠️ Cette déclaration crée automatiquement le carnet de santé dans la section Enfants et clôture votre suivi de grossesse. Cette action est irréversible.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  hero: { alignItems: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginTop: 12 },
  sub: { color: COLORS.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 19 },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, color: COLORS.textPrimary, fontSize: 15 },
  row: { flexDirection: "row", gap: 12 },
  sex: { flex: 1, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", backgroundColor: COLORS.surface },
  sexOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  sexTxt: { fontWeight: "800", color: COLORS.textPrimary },
  sexTxtOn: { color: COLORS.primary },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.pill, marginTop: 24 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  note: { color: COLORS.textMuted, fontSize: 11, marginTop: 16, lineHeight: 16, fontStyle: "italic", textAlign: "center" },
});
