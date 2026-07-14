/**
 * Réclamer un établissement — Formulaire pro self-service avec vérification croisée automatique
 */
import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";

const SPECIALITES = ["Médecin généraliste", "Pédiatre", "Gynécologue", "Sage-femme", "Infirmier(e)", "Pharmacien(ne)", "Chirurgien-dentiste", "Opticien-lunettier", "Kinésithérapeute", "Autre"];

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<any>(null);
  const [nom, setNom] = useState("");
  const [specialite, setSpecialite] = useState("");
  const [numeroOrdre, setNumeroOrdre] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/etablissements/${id}`).then((r: any) => setE(r.data)).catch(() => {});
  }, [id]);

  const submit = async () => {
    if (!nom.trim() || !specialite || !numeroOrdre.trim()) {
      Alert.alert("Champs manquants", "Nom, spécialité et numéro d'ordre sont obligatoires.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post(`/etablissements/${id}/claim`, {
        etablissement_id: id,
        nom_complet: nom.trim(),
        specialite,
        numero_ordre: numeroOrdre.trim().toUpperCase(),
        message: message.trim(),
      });
      Alert.alert(
        r.data.status === "auto_approved" ? "✅ Approuvé automatiquement !" : "🕒 Demande envoyée",
        `${r.data.message}\n\nScore vérification croisée : ${r.data.cross_check_score}/100`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail || "Échec de la demande.");
    } finally { setSubmitting(false); }
  };

  if (!e) return <SafeAreaView style={s.loader}><ActivityIndicator color="#EC4899" size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <Text style={s.heroTitle}>👨‍⚕️ Réclamer cet établissement</Text>
          <Text style={s.etabName}>{e.nom}</Text>
          <Text style={s.etabMeta}>📍 {e.commune || e.region} · {e.categorie}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>🔍 Vérification croisée automatique</Text>
          <Text style={s.help}>
            Nous validons automatiquement votre demande si :{"\n"}
            • Votre nom apparaît dans l'établissement (+40 pts){"\n"}
            • Vous êtes le responsable enregistré (+50 pts){"\n"}
            • Votre numéro d'ordre respecte le format CI (+30 pts){"\n"}
            Score ≥ 70 = auto-approuvé
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Nom complet *</Text>
          <TextInput value={nom} onChangeText={setNom} style={s.inp} placeholder="Dr. Kouassi Marc" placeholderTextColor="#94A3B8" autoCapitalize="words" />

          <Text style={s.label}>Spécialité *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {SPECIALITES.map((sp) => (
              <TouchableOpacity key={sp} onPress={() => setSpecialite(sp)} style={[s.chip, specialite === sp && s.chipActive]}>
                <Text style={[s.chipTxt, specialite === sp && s.chipTxtActive]}>{sp}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.label}>Numéro d'ordre *</Text>
          <TextInput
            value={numeroOrdre}
            onChangeText={setNumeroOrdre}
            style={s.inp}
            placeholder="CI-MED-1234 · CI-SF-5678 · CI-IDE-9012"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
          />
          <Text style={s.hint}>Format : CI-[MED|SF|IDE|PHA|DENT]-XXXX</Text>

          <Text style={s.label}>Message pour l'admin (optionnel)</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            style={[s.inp, { minHeight: 80, textAlignVertical: "top" }]}
            placeholder="Précisez votre lien avec l'établissement..."
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={s.submitTxt}>Envoyer la demande</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          🔐 Vos informations sont chiffrées (AES-256).{"\n"}
          Validation admin sous 48-72h si non auto-approuvée.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  scroll: { padding: 14, paddingBottom: 60 },
  hero: { padding: 16, backgroundColor: "#EC4899", borderRadius: 12, marginBottom: 12 },
  heroTitle: { color: "#fff", fontWeight: "800", fontSize: 18 },
  etabName: { color: "#fff", fontSize: 14, marginTop: 8, fontWeight: "700" },
  etabMeta: { color: "#FCE7F3", fontSize: 12, marginTop: 4 },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 12 },
  sectionTitle: { fontWeight: "800", color: "#0F172A", fontSize: 14, marginBottom: 8 },
  help: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  label: { fontWeight: "700", color: "#334155", fontSize: 12, marginBottom: 6, marginTop: 8 },
  inp: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: "#0F172A" },
  hint: { color: "#94A3B8", fontSize: 10, marginTop: 4, fontStyle: "italic" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#F1F5F9", borderRadius: 999 },
  chipActive: { backgroundColor: "#EC4899" },
  chipTxt: { color: "#334155", fontSize: 12, fontWeight: "700" },
  chipTxtActive: { color: "#fff" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EC4899", padding: 14, borderRadius: 999, marginBottom: 12 },
  submitTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer: { color: "#94A3B8", fontSize: 11, textAlign: "center", lineHeight: 15 },
});
