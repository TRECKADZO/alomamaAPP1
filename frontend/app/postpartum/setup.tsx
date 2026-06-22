import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { smartPost } from "../../lib/offline";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import DateField from "../../components/DateField";

export default function PostpartumSetup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ enfant_id?: string; date?: string }>();
  const [date, setDate] = useState(String(params.date || ""));
  const [voie, setVoie] = useState<"voie_basse"|"voie_basse_episio"|"cesarienne"|"instrumentale">("voie_basse");
  const [allait, setAllait] = useState<"maternel"|"mixte"|"biberon"|"">("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!date) return Alert.alert("Date requise", "Indiquez la date d'accouchement.");
    try {
      setBusy(true);
      const r = await smartPost("/postpartum/setup", {
        accouchement_date: date,
        voie_accouchement: voie,
        allaitement: allait || undefined,
        enfant_id: params.enfant_id,
      });
      Alert.alert("🌸 Bienvenue", "Votre suivi post-partum commence.\nN'hésitez pas à faire un check-in dès aujourd'hui.", [
        { text: "OK", onPress: () => router.replace("/postpartum" as any) },
      ]);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.title}>Configurer mon suivi post-partum</Text>
          <Text style={s.sub}>Ces informations restent privées et chiffrées.</Text>

          <Text style={s.label}>Date d'accouchement *</Text>
          <DateField value={date} onChange={setDate} maximumDate={new Date()} placeholder="Sélectionner la date" />

          <Text style={s.label}>Voie d'accouchement</Text>
          <View style={s.row}>
            {([{v:"voie_basse",l:"Voie basse"},{v:"voie_basse_episio",l:"Voie basse + épisio"},{v:"cesarienne",l:"Césarienne"},{v:"instrumentale",l:"Forceps/Ventouse"}] as const).map(o => (
              <TouchableOpacity key={o.v} style={[s.opt, voie === o.v && s.optOn]} onPress={() => setVoie(o.v as any)}>
                <Text style={[s.optTxt, voie === o.v && s.optTxtOn]}>{o.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Allaitement (optionnel)</Text>
          <View style={s.row}>
            {([{v:"maternel",l:"Maternel"},{v:"mixte",l:"Mixte"},{v:"biberon",l:"Biberon"}] as const).map(o => (
              <TouchableOpacity key={o.v} style={[s.opt, allait === o.v && s.optOn]} onPress={() => setAllait(allait === o.v ? "" : o.v as any)}>
                <Text style={[s.optTxt, allait === o.v && s.optTxtOn]}>{o.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.gentle}>
            <Ionicons name="heart" size={18} color="#EC4899" />
            <Text style={s.gentleTxt}>Ce module est réservé à vous. Aucun professionnel n'y aura accès sans votre consentement explicite.</Text>
          </View>

          <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={s.btnTxt}>{busy ? "Configuration..." : "Démarrer mon suivi"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDF2F8" },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { color: COLORS.textSecondary, marginTop: 6, marginBottom: 14, lineHeight: 18 },
  label: { fontWeight: "700", color: COLORS.textPrimary, marginTop: 16, marginBottom: 8, fontSize: 13 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  opt: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: "#fff" },
  optOn: { borderColor: "#EC4899", backgroundColor: "#FCE7F3" },
  optTxt: { fontWeight: "700", color: COLORS.textSecondary, fontSize: 12 },
  optTxtOn: { color: "#EC4899" },
  gentle: { flexDirection: "row", gap: 10, padding: 12, marginTop: 20, backgroundColor: "#FCE7F3", borderRadius: RADIUS.md, alignItems: "flex-start" },
  gentleTxt: { flex: 1, color: "#831843", fontSize: 12, lineHeight: 17 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EC4899", padding: 16, borderRadius: RADIUS.pill, marginTop: 24 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
