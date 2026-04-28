/**
 * Carnet Médical Modulaire — Création rétroactive d'un enfant
 * Pour les enfants nés avant l'implémentation du module, ou sans déclaration de naissance numérique.
 */
import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { api, formatError } from "../../lib/api";
import { smartPost } from "../../lib/offline";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import DateField from "../../components/DateField";
import { GROUPES_SANGUINS } from "../../lib/data";

const ALLERGIES_COMMUNES = [
  "Arachides", "Œufs", "Lait", "Gluten", "Soja", "Poisson", "Fruits de mer",
  "Pollen", "Acariens", "Piqûres d'insectes", "Pénicilline", "Autres antibiotiques",
];

export default function NouveauEnfant() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);

  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    date_naissance: "",
    sexe: "F" as "F" | "M",
    lieu_naissance: "",
    numero_cmu: "",
    groupe_sanguin: "",
    allergies: [] as string[],
  });

  const toggleAllergy = (a: string) => {
    setForm((f) => ({
      ...f,
      allergies: f.allergies.includes(a) ? f.allergies.filter((x) => x !== a) : [...f.allergies, a],
    }));
  };

  const pickImage = async (fromCamera: boolean) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert("Permission refusée");
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.6, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.6, allowsEditing: true, aspect: [1, 1] });
      if (!r.canceled && r.assets[0]?.base64) {
        setPhoto(`data:image/jpeg;base64,${r.assets[0].base64}`);
      }
    } catch (e) { Alert.alert("Erreur", String(e)); }
  };

  const submit = async () => {
    // Validation
    const nomComplet = `${form.prenom.trim()} ${form.nom.trim()}`.trim();
    if (!nomComplet) return Alert.alert("Prénom ou nom requis");
    if (!form.date_naissance) return Alert.alert("Date de naissance requise");
    setLoading(true);
    try {
      // Création de l'enfant
      const r = await smartPost("/enfants", {
        nom: nomComplet,
        date_naissance: form.date_naissance,
        sexe: form.sexe,
        lieu_naissance: form.lieu_naissance.trim() || undefined,
        numero_cmu: form.numero_cmu.trim() || undefined,
        groupe_sanguin: form.groupe_sanguin || undefined,
        allergies: form.allergies.length ? form.allergies : undefined,
      });
      // Upload photo si fournie et enfant créé en ligne
      if (photo && r.data?.id) {
        try {
          await api.post(`/enfants/${r.data.id}/photo`, { photo_base64: photo });
        } catch { /* non bloquant */ }
      }
      if (r.queued) {
        Alert.alert("Hors ligne", "Enfant enregistré localement, sera synchronisé au retour de la connexion.");
      } else {
        Alert.alert("✅ Carnet créé", `Le carnet médical de ${form.prenom} a été créé avec succès.`, [
          { text: "Voir le carnet", onPress: () => router.replace(`/enfants/${r.data.id}/carnet`) },
        ]);
      }
      router.back();
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Nouveau carnet médical</Text>
          <Text style={styles.sub}>Étape {step}/3</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
          {/* Barre de progression */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
          </View>

          {/* ÉTAPE 1 : Identité */}
          {step === 1 && (
            <View style={styles.card}>
              <View style={styles.iconHeader}>
                <View style={[styles.iconCircle, { backgroundColor: "#FCE7F3" }]}>
                  <Ionicons name="person" size={28} color="#EC4899" />
                </View>
                <Text style={styles.cardTitle}>Identité de l'enfant</Text>
              </View>

              {/* Photo */}
              <Text style={styles.label}>Photo (facultatif)</Text>
              <View style={styles.photoRow}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="person-outline" size={40} color={COLORS.textMuted} />
                  </View>
                )}
                <View style={{ gap: 6 }}>
                  <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(true)}>
                    <Ionicons name="camera" size={16} color={COLORS.primary} />
                    <Text style={styles.photoBtnText}>Caméra</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(false)}>
                    <Ionicons name="images" size={16} color={COLORS.primary} />
                    <Text style={styles.photoBtnText}>Galerie</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.label}>Prénom *</Text>
              <TextInput style={styles.input} value={form.prenom} onChangeText={(v) => setForm({ ...form, prenom: v })} placeholder="Ex: Aïcha" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.label}>Nom de famille</Text>
              <TextInput style={styles.input} value={form.nom} onChangeText={(v) => setForm({ ...form, nom: v })} placeholder="Ex: Kouassi" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.label}>Sexe *</Text>
              <View style={styles.sexeRow}>
                <TouchableOpacity
                  style={[styles.sexeBtn, form.sexe === "F" && { backgroundColor: "#FCE7F3", borderColor: "#EC4899" }]}
                  onPress={() => setForm({ ...form, sexe: "F" })}
                >
                  <Text style={styles.sexeEmoji}>👧</Text>
                  <Text style={[styles.sexeText, form.sexe === "F" && { color: "#EC4899" }]}>Fille</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sexeBtn, form.sexe === "M" && { backgroundColor: "#DBEAFE", borderColor: "#3B82F6" }]}
                  onPress={() => setForm({ ...form, sexe: "M" })}
                >
                  <Text style={styles.sexeEmoji}>👦</Text>
                  <Text style={[styles.sexeText, form.sexe === "M" && { color: "#3B82F6" }]}>Garçon</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Date de naissance *</Text>
              <DateField value={form.date_naissance} mode="date" onChange={(v) => setForm({ ...form, date_naissance: v })} maximumDate={new Date()} />

              <Text style={styles.label}>Lieu de naissance</Text>
              <TextInput style={styles.input} value={form.lieu_naissance} onChangeText={(v) => setForm({ ...form, lieu_naissance: v })} placeholder="Ex: Maternité de Cocody, Abidjan" placeholderTextColor={COLORS.textMuted} />
            </View>
          )}

          {/* ÉTAPE 2 : Santé */}
          {step === 2 && (
            <View style={styles.card}>
              <View style={styles.iconHeader}>
                <View style={[styles.iconCircle, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="heart" size={28} color="#16A34A" />
                </View>
                <Text style={styles.cardTitle}>Informations de santé</Text>
              </View>

              <Text style={styles.label}>Numéro CMU de l'enfant (facultatif)</Text>
              <TextInput
                style={styles.input}
                value={form.numero_cmu}
                onChangeText={(v) => setForm({ ...form, numero_cmu: v.replace(/[^0-9]/g, "").slice(0, 20) })}
                keyboardType="number-pad"
                placeholder="Ex: 225000000000"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={styles.hint}>🔒 Chiffré au repos. Affiché uniquement sur votre appareil et à vous.</Text>

              <Text style={styles.label}>Groupe sanguin</Text>
              <View style={styles.groupeRow}>
                {GROUPES_SANGUINS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setForm({ ...form, groupe_sanguin: form.groupe_sanguin === g ? "" : g })}
                    style={[styles.groupePill, form.groupe_sanguin === g && { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }]}
                  >
                    <Text style={[styles.groupeText, form.groupe_sanguin === g && { color: "#DC2626" }]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Allergies connues</Text>
              <View style={styles.allergiesWrap}>
                {ALLERGIES_COMMUNES.map((a) => {
                  const active = form.allergies.includes(a);
                  return (
                    <TouchableOpacity
                      key={a}
                      onPress={() => toggleAllergy(a)}
                      style={[styles.allergyChip, active && { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}
                    >
                      <Text style={[styles.allergyText, active && { color: "#B45309" }]}>
                        {active ? "✓ " : ""}{a}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>🔒 Les allergies sont chiffrées dans la base. Affichées en priorité en cas d'urgence.</Text>
            </View>
          )}

          {/* ÉTAPE 3 : Récap */}
          {step === 3 && (
            <View style={styles.card}>
              <View style={styles.iconHeader}>
                <View style={[styles.iconCircle, { backgroundColor: "#DBEAFE" }]}>
                  <Ionicons name="checkmark-circle" size={28} color="#3B82F6" />
                </View>
                <Text style={styles.cardTitle}>Vérifier et valider</Text>
              </View>

              <View style={styles.recap}>
                {photo && <Image source={{ uri: photo }} style={styles.recapPhoto} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.recapName}>{form.prenom} {form.nom}</Text>
                  <Text style={styles.recapMeta}>{form.sexe === "F" ? "👧 Fille" : "👦 Garçon"} · né(e) le {form.date_naissance || "—"}</Text>
                  {form.lieu_naissance ? <Text style={styles.recapMeta}>📍 {form.lieu_naissance}</Text> : null}
                  {form.groupe_sanguin ? <Text style={styles.recapMeta}>🩸 Groupe sanguin : {form.groupe_sanguin}</Text> : null}
                  {form.numero_cmu ? <Text style={styles.recapMeta}>🏥 CMU enregistrée</Text> : null}
                  {form.allergies.length > 0 ? <Text style={styles.recapMeta}>⚠️ {form.allergies.length} allergie(s)</Text> : null}
                </View>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={18} color="#0E7490" />
                <Text style={styles.infoText}>
                  Une fois créé, vous aurez accès au carnet modulaire par âge : croissance OMS, vaccins, notes médicales, documents et plus.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer navigation */}
      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(step - 1)}>
            <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
            <Text style={styles.btnSecondaryText}>Précédent</Text>
          </TouchableOpacity>
        )}
        {step < 3 ? (
          <TouchableOpacity style={{ flex: 1 }} onPress={() => {
            if (step === 1 && (!form.prenom.trim() || !form.date_naissance)) {
              return Alert.alert("Champs requis", "Prénom et date de naissance sont obligatoires.");
            }
            setStep(step + 1);
          }}>
            <LinearGradient colors={["#EC4899", "#F472B6"]} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>Suivant</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={{ flex: 1 }} onPress={submit} disabled={loading}>
            <LinearGradient colors={["#16A34A", "#22C55E"]} style={styles.btnPrimary}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Créer le carnet</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  progressBar: { height: 6, backgroundColor: COLORS.surface, borderRadius: 3, overflow: "hidden", marginBottom: 18 },
  progressFill: { height: "100%", backgroundColor: "#EC4899" },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  iconHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 17, fontWeight: "800", color: COLORS.textPrimary },

  label: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary },
  hint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontStyle: "italic" },

  photoRow: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 8 },
  photoPreview: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: COLORS.border },
  photoPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: COLORS.border, borderStyle: "dashed" },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  photoBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },

  sexeRow: { flexDirection: "row", gap: 10 },
  sexeBtn: { flex: 1, alignItems: "center", padding: 16, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bgPrimary },
  sexeEmoji: { fontSize: 32 },
  sexeText: { fontWeight: "800", fontSize: 14, color: COLORS.textPrimary, marginTop: 4 },

  groupeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  groupePill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgPrimary, minWidth: 60, alignItems: "center" },
  groupeText: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },

  allergiesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  allergyChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgPrimary },
  allergyText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },

  recap: { flexDirection: "row", gap: 12, padding: 14, backgroundColor: COLORS.bgPrimary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  recapPhoto: { width: 72, height: 72, borderRadius: 36 },
  recapName: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  recapMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  infoBox: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#CFFAFE", borderRadius: RADIUS.md, marginTop: 14, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 12, color: "#0E7490", lineHeight: 17 },

  footer: { flexDirection: "row", gap: 10, padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  btnSecondary: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  btnSecondaryText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 14 },
  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 999 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
