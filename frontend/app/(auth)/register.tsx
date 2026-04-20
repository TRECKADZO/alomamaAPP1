import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../lib/auth";
import { formatError } from "../../lib/api";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

type Role = "maman" | "professionnel" | "centre_sante" | "famille";

const ROLES: { id: Role; icon: any; label: string; sub: string; colors: [string, string] }[] = [
  { id: "maman", icon: "heart", label: "Maman", sub: "Suivi grossesse & enfants", colors: ["#F472B6", "#FB7185"] },
  { id: "professionnel", icon: "medkit", label: "Professionnel", sub: "Médecin, sage-femme", colors: ["#2DD4BF", "#06B6D4"] },
  { id: "centre_sante", icon: "business", label: "Centre de santé", sub: "Clinique, PMI, hôpital", colors: ["#A855F7", "#6366F1"] },
  { id: "famille", icon: "people", label: "Famille", sub: "Proche d'une maman", colors: ["#F59E0B", "#EF4444"] },
];

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [role, setRole] = useState<Role>("maman");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    specialite: "",
    code_invitation_centre: "",
    nom_centre: "",
    type_etablissement: "clinique_privee",
    numero_agrement: "",
    adresse: "",
    ville: "",
    region: "",
    email_contact: "",
  });
  const [loading, setLoading] = useState(false);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert("Champs requis", "Nom, email et mot de passe sont requis");
      return;
    }
    if (form.password.length < 6) {
      Alert.alert("Mot de passe", "Minimum 6 caractères");
      return;
    }
    if (role === "centre_sante" && !form.nom_centre) {
      Alert.alert("Champ requis", "Nom du centre obligatoire");
      return;
    }
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone || undefined,
        role,
        specialite: role === "professionnel" ? form.specialite : undefined,
        code_invitation_centre: role === "professionnel" ? form.code_invitation_centre : undefined,
        nom_centre: role === "centre_sante" ? form.nom_centre : undefined,
        type_etablissement: role === "centre_sante" ? form.type_etablissement : undefined,
        numero_agrement: role === "centre_sante" ? form.numero_agrement : undefined,
        adresse: role === "centre_sante" ? form.adresse : undefined,
        ville: form.ville || undefined,
        region: form.region || undefined,
        email_contact: role === "centre_sante" ? form.email_contact : undefined,
      } as any);
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="register-back-btn">
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>Choisissez votre type de compte</Text>

          {/* Roles 2x2 grid */}
          <View style={styles.rolesGrid}>
            {ROLES.map((r) => {
              const active = role === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.roleCard, active && styles.roleCardActive]}
                  onPress={() => setRole(r.id)}
                  testID={`role-${r.id}`}
                >
                  <LinearGradient colors={r.colors} style={styles.roleIcon}>
                    <Ionicons name={r.icon} size={22} color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.roleLabel, active && { color: COLORS.primary }]}>{r.label}</Text>
                  <Text style={styles.roleSub}>{r.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Common fields */}
          <Field label="Nom complet *" icon="person-outline">
            <TextInput style={styles.input} value={form.name} onChangeText={(v) => update("name", v)} placeholder="Votre nom" placeholderTextColor={COLORS.textMuted} testID="reg-name-input" />
          </Field>

          <Field label="Email *" icon="mail-outline">
            <TextInput style={styles.input} value={form.email} onChangeText={(v) => update("email", v)} autoCapitalize="none" keyboardType="email-address" placeholder="vous@exemple.com" placeholderTextColor={COLORS.textMuted} testID="reg-email-input" />
          </Field>

          <Field label="Mot de passe *" icon="lock-closed-outline">
            <TextInput style={styles.input} value={form.password} onChangeText={(v) => update("password", v)} secureTextEntry placeholder="Min. 6 caractères" placeholderTextColor={COLORS.textMuted} testID="reg-password-input" />
          </Field>

          <Field label="Téléphone" icon="call-outline">
            <TextInput style={styles.input} value={form.phone} onChangeText={(v) => update("phone", v)} keyboardType="phone-pad" placeholder="+225 ..." placeholderTextColor={COLORS.textMuted} testID="reg-phone-input" />
          </Field>

          {role === "professionnel" && (
            <>
              <Field label="Spécialité" icon="briefcase-outline">
                <TextInput style={styles.input} value={form.specialite} onChangeText={(v) => update("specialite", v)} placeholder="Gynécologue, Pédiatre…" placeholderTextColor={COLORS.textMuted} testID="reg-specialite-input" />
              </Field>
              <Field label="Code d'invitation centre (optionnel)" icon="key-outline">
                <TextInput style={styles.input} value={form.code_invitation_centre} onChangeText={(v) => update("code_invitation_centre", v.toUpperCase())} autoCapitalize="characters" placeholder="ABCD12" placeholderTextColor={COLORS.textMuted} maxLength={8} />
              </Field>
            </>
          )}

          {role === "centre_sante" && (
            <>
              <Field label="Nom du centre *" icon="business-outline">
                <TextInput style={styles.input} value={form.nom_centre} onChangeText={(v) => update("nom_centre", v)} placeholder="Clinique du Sud, PMI Yopougon…" placeholderTextColor={COLORS.textMuted} testID="reg-nom-centre" />
              </Field>
              <Field label="Type d'établissement" icon="medical-outline">
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 }}>
                  {[
                    { v: "clinique_privee", l: "Clinique" },
                    { v: "hopital_public", l: "Hôpital" },
                    { v: "pmi", l: "PMI" },
                    { v: "maternite", l: "Maternité" },
                  ].map((t) => (
                    <TouchableOpacity
                      key={t.v}
                      onPress={() => update("type_etablissement", t.v)}
                      style={[
                        styles.typePill,
                        form.type_etablissement === t.v && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                      ]}
                    >
                      <Text style={[styles.typePillText, form.type_etablissement === t.v && { color: "#fff" }]}>{t.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
              <Field label="Numéro d'agrément" icon="document-text-outline">
                <TextInput style={styles.input} value={form.numero_agrement} onChangeText={(v) => update("numero_agrement", v)} placeholder="Optionnel" placeholderTextColor={COLORS.textMuted} />
              </Field>
              <Field label="Adresse" icon="location-outline">
                <TextInput style={styles.input} value={form.adresse} onChangeText={(v) => update("adresse", v)} placeholder="Rue, quartier…" placeholderTextColor={COLORS.textMuted} />
              </Field>
              <Field label="Email contact" icon="mail-outline">
                <TextInput style={styles.input} value={form.email_contact} onChangeText={(v) => update("email_contact", v)} keyboardType="email-address" autoCapitalize="none" placeholder="contact@centre.ci" placeholderTextColor={COLORS.textMuted} />
              </Field>
            </>
          )}

          {(role === "maman" || role === "centre_sante" || role === "famille" || role === "professionnel") && (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Ville" icon="location-outline">
                  <TextInput style={styles.input} value={form.ville} onChangeText={(v) => update("ville", v)} placeholder="Abidjan" placeholderTextColor={COLORS.textMuted} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Région" icon="map-outline">
                  <TextInput style={styles.input} value={form.region} onChangeText={(v) => update("region", v)} placeholder="Lagunes" placeholderTextColor={COLORS.textMuted} />
                </Field>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.btnPrimary} onPress={handleRegister} disabled={loading} testID="register-submit-btn">
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Créer mon compte</Text>}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Déjà un compte ? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="goto-login-link">
                <Text style={styles.footerLink}>Se connecter</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color={COLORS.textMuted} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.xl, flexGrow: 1, paddingBottom: 60 },
  back: { width: 40, height: 40, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, marginTop: 10 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: SPACING.xl },
  rolesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: SPACING.xl },
  roleCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  roleCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  roleIcon: { width: 40, height: 40, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  roleLabel: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 15 },
  roleSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  field: { marginBottom: SPACING.md },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 8 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, minHeight: 52 },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary, paddingVertical: 10 },
  typePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  typePillText: { fontSize: 12, fontWeight: "600", color: COLORS.textPrimary },
  btnPrimary: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, height: 52, alignItems: "center", justifyContent: "center", marginTop: SPACING.lg },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: SPACING.lg },
  footerText: { color: COLORS.textSecondary },
  footerLink: { color: COLORS.primary, fontWeight: "700" },
});
