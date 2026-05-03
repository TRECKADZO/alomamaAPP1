import { useState, useMemo } from "react";
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
import PickerField from "../../components/PickerField";
import PhoneInput, { extractLocalDigits } from "../../components/PhoneInput";
import { REGIONS_CI, SPECIALITES } from "../../lib/data";

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
  const [mode, setMode] = useState<"email" | "phone">("email");
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
    referral_code: "",
  });
  const [loading, setLoading] = useState(false);
  // Consentement
  const [accepteCgu, setAccepteCgu] = useState(false);
  const [acceptePolitique, setAcceptePolitique] = useState(false);
  const [accepteDonneesSante, setAccepteDonneesSante] = useState(false);
  const [accepteComms, setAccepteComms] = useState(false);
  // 🤝 Parrainage
  const [refValidation, setRefValidation] = useState<{ valid: boolean; parrain_name?: string; reason?: string } | null>(null);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleRegister = async () => {
    if (!form.name || !form.password) {
      Alert.alert("Champs requis", "Nom et mot de passe sont requis");
      return;
    }
    if (mode === "email" && !form.email) {
      Alert.alert("Email requis", "Saisissez votre email");
      return;
    }
    if (mode === "phone") {
      const digits = extractLocalDigits(form.phone);
      if (digits.length !== 10) {
        Alert.alert("Téléphone invalide", "Saisissez vos 10 chiffres après l'indicatif +225");
        return;
      }
    }
    // Si email mais téléphone optionnel renseigné, valider qu'il est complet
    if (mode === "email" && form.phone) {
      const digits = extractLocalDigits(form.phone);
      if (digits.length !== 10) {
        Alert.alert("Téléphone invalide", "Le numéro optionnel doit contenir 10 chiffres après +225, ou laissez le champ vide.");
        return;
      }
    }
    if (form.password.length < 6) {
      Alert.alert("Mot de passe", "Minimum 6 caractères");
      return;
    }
    if (role === "centre_sante" && !form.nom_centre) {
      Alert.alert("Champ requis", "Nom du centre obligatoire");
      return;
    }
    // Consentement
    if (!accepteCgu || !acceptePolitique) {
      Alert.alert("Consentement requis", "Vous devez accepter les CGU et la Politique de Confidentialité pour créer votre compte.");
      return;
    }
    if ((role === "maman" || role === "professionnel" || role === "centre_sante") && !accepteDonneesSante) {
      Alert.alert("Consentement santé requis", "Les rôles Maman, Professionnel et Centre nécessitent le consentement au traitement des données de santé.");
      return;
    }
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: mode === "email" ? form.email.trim().toLowerCase() : undefined,
        phone: mode === "phone" ? form.phone.trim() : (form.phone || undefined),
        password: form.password,
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
        accepte_cgu: accepteCgu,
        accepte_politique_confidentialite: acceptePolitique,
        accepte_donnees_sante: accepteDonneesSante,
        accepte_communications: accepteComms,
        referral_code: role === "maman" && form.referral_code ? form.referral_code.trim().toUpperCase() : undefined,
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

          {/* Toggle email / téléphone */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "email" && styles.modeBtnActive]}
              onPress={() => setMode("email")}
              testID="reg-mode-email"
            >
              <Ionicons name="mail" size={14} color={mode === "email" ? "#fff" : COLORS.textPrimary} />
              <Text style={[styles.modeBtnText, mode === "email" && { color: "#fff" }]}>S'inscrire par email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "phone" && styles.modeBtnActive]}
              onPress={() => setMode("phone")}
              testID="reg-mode-phone"
            >
              <Ionicons name="call" size={14} color={mode === "phone" ? "#fff" : COLORS.textPrimary} />
              <Text style={[styles.modeBtnText, mode === "phone" && { color: "#fff" }]}>Par téléphone</Text>
            </TouchableOpacity>
          </View>

          {mode === "email" ? (
            <Field label="Email *" icon="mail-outline">
              <TextInput style={styles.input} value={form.email} onChangeText={(v) => update("email", v)} autoCapitalize="none" keyboardType="email-address" placeholder="vous@exemple.com" placeholderTextColor={COLORS.textMuted} testID="reg-email-input" />
            </Field>
          ) : (
            <View style={styles.field}>
              <Text style={styles.label}>Numéro de téléphone *</Text>
              <PhoneInput
                value={form.phone}
                onChangeText={(canonical) => update("phone", canonical)}
                testID="reg-phone-input"
              />
              <Text style={styles.hint}>Indicatif Côte d'Ivoire fixé. Saisissez vos 10 chiffres uniquement.</Text>
            </View>
          )}

          <Field label="Mot de passe *" icon="lock-closed-outline">
            <TextInput style={styles.input} value={form.password} onChangeText={(v) => update("password", v)} secureTextEntry placeholder="Min. 6 caractères" placeholderTextColor={COLORS.textMuted} testID="reg-password-input" />
          </Field>

          {mode === "email" && (
            <View style={styles.field}>
              <Text style={styles.label}>Téléphone (optionnel)</Text>
              <PhoneInput
                value={form.phone}
                onChangeText={(canonical) => update("phone", canonical)}
                testID="reg-phone-optional-input"
              />
            </View>
          )}

          {role === "professionnel" && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Spécialité</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="briefcase-outline" size={18} color={COLORS.textMuted} />
                  <PickerField
                    value={form.specialite}
                    onChange={(v) => update("specialite", v)}
                    options={SPECIALITES}
                    placeholder="Choisir une spécialité"
                    searchable
                    testID="reg-specialite-picker"
                  />
                </View>
              </View>
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
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Région</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="map-outline" size={18} color={COLORS.textMuted} />
                  <PickerField
                    value={form.region}
                    onChange={(v) => { update("region", v); update("ville", ""); }}
                    options={REGIONS_CI.map((r) => r.name)}
                    placeholder="Choisir une région"
                    searchable
                    testID="reg-region-picker"
                  />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Ville</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="location-outline" size={18} color={COLORS.textMuted} />
                  <PickerField
                    value={form.ville}
                    onChange={(v) => update("ville", v)}
                    options={form.region ? (REGIONS_CI.find((r) => r.name === form.region)?.villes || []) : []}
                    placeholder={form.region ? "Choisir une ville" : "Sélectionnez d'abord une région"}
                    searchable
                    testID="reg-ville-picker"
                  />
                </View>
              </View>
            </>
          )}

          {/* 🤝 Code de parrainage (uniquement pour les mamans) */}
          {role === "maman" && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Code de parrainage (optionnel)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="people-outline" size={20} color={COLORS.textMuted} style={styles.icon} />
                <TextInput
                  style={[styles.input, { textTransform: "uppercase" }]}
                  placeholder="Ex : A7K2M9"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.referral_code}
                  autoCapitalize="characters"
                  maxLength={6}
                  onChangeText={async (v) => {
                    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
                    update("referral_code", clean);
                    if (clean.length === 6) {
                      try {
                        const r = await (await import("../../lib/api")).api.post("/referral/validate-code", { code: clean });
                        setRefValidation(r.data);
                      } catch {
                        setRefValidation({ valid: false, reason: "Erreur de vérification" });
                      }
                    } else {
                      setRefValidation(null);
                    }
                  }}
                  testID="reg-referral-code"
                />
              </View>
              {refValidation && (
                <Text style={{ fontSize: 12, marginTop: 4, color: refValidation.valid ? "#10B981" : "#EF4444", fontWeight: "700" }}>
                  {refValidation.valid
                    ? `✓ Code valide — parrainée par ${refValidation.parrain_name}`
                    : `✗ ${refValidation.reason || "Code invalide"}`}
                </Text>
              )}
              <Text style={{ fontSize: 11, marginTop: 4, color: COLORS.textMuted }}>
                Une amie vous a invité ? Entrez son code pour la remercier 🎁
              </Text>
            </View>
          )}

          <View style={styles.consentBox}>
            <Text style={styles.consentTitle}>✅ Consentement requis</Text>
            <ConsentRow
              checked={accepteCgu}
              onToggle={() => setAccepteCgu((v) => !v)}
              testID="chk-cgu"
            >
              J'accepte les{" "}
              <Text style={styles.consentLink} onPress={() => router.push("/cgu")}>Conditions Générales d'Utilisation</Text>
            </ConsentRow>
            <ConsentRow
              checked={acceptePolitique}
              onToggle={() => setAcceptePolitique((v) => !v)}
              testID="chk-politique"
            >
              J'accepte la{" "}
              <Text style={styles.consentLink} onPress={() => router.push("/privacy")}>Politique de Confidentialité</Text>
            </ConsentRow>
            {(role === "maman" || role === "professionnel" || role === "centre_sante") && (
              <ConsentRow
                checked={accepteDonneesSante}
                onToggle={() => setAccepteDonneesSante((v) => !v)}
                testID="chk-sante"
              >
                J'autorise le traitement sécurisé de mes données de santé (grossesse, enfants, CMU, consultations) conformément à la loi ivoirienne n°2013-450
              </ConsentRow>
            )}
            <ConsentRow
              checked={accepteComms}
              onToggle={() => setAccepteComms((v) => !v)}
              testID="chk-comms"
              optional
            >
              Je souhaite recevoir des rappels et conseils santé (optionnel)
            </ConsentRow>
          </View>

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

function ConsentRow({ checked, onToggle, children, testID, optional }: {
  checked: boolean; onToggle: () => void; children: React.ReactNode; testID?: string; optional?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.consentRow} onPress={onToggle} testID={testID} activeOpacity={0.7}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={styles.consentText}>
        {children}
        {optional && <Text style={styles.consentOptional}>  (optionnel)</Text>}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  scroll: { padding: SPACING.xl, flexGrow: 1, paddingBottom: 60 },
  back: { width: 40, height: 40, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, marginTop: 10 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: SPACING.xl },
  rolesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: SPACING.xl },
  modeToggle: { flexDirection: "row", gap: 6, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.pill, padding: 4, marginBottom: SPACING.md },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: RADIUS.pill },
  modeBtnActive: { backgroundColor: COLORS.primary },
  modeBtnText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 12 },
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
  // Consentement
  consentBox: { marginTop: SPACING.lg, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: 10 },
  consentTitle: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 4 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  consentText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  consentOptional: { color: COLORS.textMuted, fontSize: 11, fontStyle: "italic" },
  consentLink: { color: COLORS.primary, fontWeight: "700", textDecorationLine: "underline" },
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontStyle: "italic" },
});
