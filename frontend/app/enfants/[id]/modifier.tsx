/**
 * ✏️ Modifier les informations d'un enfant
 * Permet à la maman de modifier TOUTES les données de son enfant :
 * identité, photo, naissance, groupe sanguin, allergies, CMU, notes.
 */
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { api, formatError } from "../../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";
import DateField from "../../../components/DateField";
import { GROUPES_SANGUINS } from "../../../lib/data";

const ALLERGIES_COMMUNES = [
  "Arachides", "Œufs", "Lait", "Gluten", "Soja", "Poisson", "Fruits de mer",
  "Pollen", "Acariens", "Piqûres d'insectes", "Pénicilline", "Autres antibiotiques",
];

export default function ModifierEnfant() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);

  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    date_naissance: "",
    sexe: "F" as "F" | "M",
    lieu_naissance: "",
    numero_cmu: "",
    groupe_sanguin: "",
    allergies: [] as string[],
    poids_kg: "",
    taille_cm: "",
    notes: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/enfants");
        const e = (r.data || []).find((x: any) => x.id === id);
        if (!e) {
          Alert.alert("Introuvable", "Cet enfant n'existe plus", [
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }
        // Split nom "Prenom Nom" — le prénom est le 1er mot, le reste le nom
        const parts = (e.nom || "").trim().split(/\s+/);
        const prenom = parts[0] || "";
        const nomFamille = parts.slice(1).join(" ");
        setForm({
          nom: nomFamille,
          prenom,
          date_naissance: e.date_naissance || "",
          sexe: e.sexe || "F",
          lieu_naissance: e.lieu_naissance || "",
          numero_cmu: e.numero_cmu || "",
          groupe_sanguin: e.groupe_sanguin || "",
          allergies: e.allergies || [],
          poids_kg: e.poids_kg != null ? String(e.poids_kg) : "",
          taille_cm: e.taille_cm != null ? String(e.taille_cm) : "",
          notes: e.notes || "",
        });
        if (e.photo_url || e.photo_base64) setPhoto(e.photo_url || e.photo_base64);
      } catch (e) {
        Alert.alert("Erreur", formatError(e));
      } finally { setLoading(false); }
    })();
  }, [id]);

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
        setPhotoChanged(true);
      }
    } catch (e) { Alert.alert("Erreur", String(e)); }
  };

  const removePhoto = () => {
    Alert.alert("Retirer la photo ?", "", [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: () => { setPhoto(null); setPhotoChanged(true); } },
    ]);
  };

  const submit = async () => {
    const nomComplet = `${form.prenom.trim()} ${form.nom.trim()}`.trim();
    if (!nomComplet) return Alert.alert("Prénom ou nom requis");
    if (!form.date_naissance) return Alert.alert("Date de naissance requise");

    setSaving(true);
    try {
      // 1) PATCH champs textuels
      const payload: any = {
        nom: nomComplet,
        date_naissance: form.date_naissance,
        sexe: form.sexe,
        lieu_naissance: form.lieu_naissance.trim() || null,
        numero_cmu: form.numero_cmu.trim() || null,
        groupe_sanguin: form.groupe_sanguin || null,
        allergies: form.allergies,
        notes: form.notes.trim() || null,
      };
      const poids = parseFloat(form.poids_kg.replace(",", "."));
      if (!isNaN(poids)) payload.poids_kg = poids;
      const taille = parseFloat(form.taille_cm.replace(",", "."));
      if (!isNaN(taille)) payload.taille_cm = taille;

      await api.patch(`/enfants/${id}`, payload);

      // 2) Photo — endpoint dédié
      if (photoChanged) {
        if (photo) {
          await api.post(`/enfants/${id}/photo`, { photo_base64: photo });
        } else {
          // Retrait : PATCH avec null
          await api.patch(`/enfants/${id}`, { photo_base64: "" }).catch(() => {});
        }
      }

      Alert.alert("✅ Enregistré", "Les informations ont été mises à jour.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>✏️ Modifier</Text>
          <Text style={styles.sub}>Informations de l&apos;enfant</Text>
        </View>
        <TouchableOpacity onPress={submit} style={styles.saveBtnMini} disabled={saving} testID="save-btn">
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}>
          {/* Photo */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📸 Photo</Text>
            <View style={styles.photoRow}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person-outline" size={40} color={COLORS.textMuted} />
                </View>
              )}
              <View style={{ gap: 6, flex: 1 }}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(true)}>
                  <Ionicons name="camera" size={16} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Prendre une photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(false)}>
                  <Ionicons name="images" size={16} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Galerie</Text>
                </TouchableOpacity>
                {photo && (
                  <TouchableOpacity style={[styles.photoBtn, { backgroundColor: "#FEE2E2" }]} onPress={removePhoto}>
                    <Ionicons name="trash" size={16} color="#DC2626" />
                    <Text style={[styles.photoBtnText, { color: "#DC2626" }]}>Retirer</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Identité */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>👶 Identité</Text>

            <Text style={styles.label}>Prénom *</Text>
            <TextInput style={styles.input} value={form.prenom} onChangeText={(v) => setForm({ ...form, prenom: v })} placeholder="Ex: Aïcha" placeholderTextColor={COLORS.textMuted} testID="input-prenom" />

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
            <TextInput style={styles.input} value={form.lieu_naissance} onChangeText={(v) => setForm({ ...form, lieu_naissance: v })} placeholder="Ex: Maternité de Cocody" placeholderTextColor={COLORS.textMuted} />
          </View>

          {/* Santé */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏥 Santé</Text>

            <Text style={styles.label}>Poids (kg)</Text>
            <TextInput
              style={styles.input}
              value={form.poids_kg}
              onChangeText={(v) => setForm({ ...form, poids_kg: v })}
              placeholder="Ex: 3.5"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Taille (cm)</Text>
            <TextInput
              style={styles.input}
              value={form.taille_cm}
              onChangeText={(v) => setForm({ ...form, taille_cm: v })}
              placeholder="Ex: 50"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Groupe sanguin</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !form.groupe_sanguin && styles.chipActive]}
                onPress={() => setForm({ ...form, groupe_sanguin: "" })}
              >
                <Text style={[styles.chipText, !form.groupe_sanguin && styles.chipTextActive]}>Non renseigné</Text>
              </TouchableOpacity>
              {GROUPES_SANGUINS.map((gs) => (
                <TouchableOpacity
                  key={gs}
                  style={[styles.chip, form.groupe_sanguin === gs && styles.chipActive]}
                  onPress={() => setForm({ ...form, groupe_sanguin: gs })}
                >
                  <Text style={[styles.chipText, form.groupe_sanguin === gs && styles.chipTextActive]}>{gs}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>N° CMU (facultatif)</Text>
            <TextInput
              style={styles.input}
              value={form.numero_cmu}
              onChangeText={(v) => setForm({ ...form, numero_cmu: v })}
              placeholder="Ex: 22345678901"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
            />
          </View>

          {/* Allergies */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚠️ Allergies connues</Text>
            <Text style={styles.helpText}>Sélectionnez ce qui s&apos;applique</Text>
            <View style={styles.chipRow}>
              {ALLERGIES_COMMUNES.map((a) => {
                const active = form.allergies.includes(a);
                return (
                  <TouchableOpacity
                    key={a}
                    style={[styles.chip, active && { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }]}
                    onPress={() => toggleAllergy(a)}
                  >
                    <Text style={[styles.chipText, active && { color: "#DC2626", fontWeight: "800" }]}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📝 Notes libres</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
              value={form.notes}
              onChangeText={(v) => setForm({ ...form, notes: v })}
              placeholder="Antécédents, particularités, précautions…"
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity onPress={submit} disabled={saving} style={{ marginTop: 6 }}>
            <LinearGradient colors={["#EC4899", "#F472B6"]} style={styles.saveBtn}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Enregistrer les modifications</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  saveBtnMini: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EC4899", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    ...SHADOW.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: "800", color: COLORS.textSecondary, marginTop: 10, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 15, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary },
  helpText: { fontSize: 11, color: COLORS.textMuted, marginBottom: 8 },
  photoRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  photoPreview: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: "#EC4899" },
  photoPlaceholder: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.bgPrimary, borderWidth: 2, borderColor: COLORS.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  photoBtnText: { color: COLORS.primary, fontWeight: "800", fontSize: 11 },
  sexeRow: { flexDirection: "row", gap: 10 },
  sexeBtn: { flex: 1, borderWidth: 2, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 14, alignItems: "center", gap: 4 },
  sexeEmoji: { fontSize: 28 },
  sexeText: { fontWeight: "800", color: COLORS.textPrimary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: "#FCE7F3", borderColor: "#EC4899" },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },
  chipTextActive: { color: "#EC4899" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999 },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
