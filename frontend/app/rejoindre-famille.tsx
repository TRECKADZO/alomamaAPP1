import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const RELATIONS = [
  { value: "partenaire", label: "Partenaire", icon: "\u{1F491}" },
  { value: "parent", label: "Parent", icon: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}" },
  { value: "belle_famille", label: "Belle-famille", icon: "\u{1F46A}" },
  { value: "ami", label: "Ami(e)", icon: "\u{1F91D}" },
  { value: "autre", label: "Autre", icon: "\u{1F464}" },
];

export default function RejoindreFamille() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [relation, setRelation] = useState("partenaire");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!code) return Alert.alert("Code requis");
    setLoading(true);
    try {
      await api.post("/famille/join", { code: code.toUpperCase(), relation });
      Alert.alert("Demande envoyée", "Le propriétaire doit accepter votre demande", [
        { text: "OK", onPress: () => router.replace("/famille") },
      ]);
    } catch (e) { Alert.alert("Erreur", formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#F59E0B", "#EF4444"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Rejoindre une famille</Text>
          <Text style={styles.sub}>Saisissez votre code d'invitation</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <LinearGradient colors={["#FEF3C7", "#FFEDD5"]} style={styles.iconBig}>
              <Ionicons name="key" size={40} color="#EA580C" />
            </LinearGradient>
          </View>

          <Text style={styles.heroTitle}>Entrez le code reçu</Text>
          <Text style={styles.heroSub}>Demandez le code à la maman que vous souhaitez suivre. Elle peut le partager depuis sa page Famille.</Text>

          <Text style={styles.label}>Code de partage</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="ABCD12"
            placeholderTextColor={COLORS.textMuted}
            maxLength={8}
            testID="join-code"
          />

          <Text style={styles.label}>Votre relation</Text>
          <View style={styles.relGrid}>
            {RELATIONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                onPress={() => setRelation(r.value)}
                style={[styles.relPill, relation === r.value && { backgroundColor: "#F59E0B", borderColor: "#F59E0B" }]}
              >
                <Text style={[styles.relPillText, relation === r.value && { color: "#fff" }]}>{r.icon} {r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={submit} disabled={loading || !code} style={{ marginTop: 30 }}>
            <LinearGradient colors={["#F59E0B", "#EF4444"]} style={[styles.btnBig, (!code || loading) && { opacity: 0.6 }]}>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={styles.btnBigText}>{loading ? "Envoi..." : "Envoyer la demande"}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.info}>
            <Ionicons name="information-circle" size={18} color="#1D4ED8" />
            <Text style={styles.infoText}>Après votre demande, la maman devra vous accepter et configurer vos permissions (accès grossesse, enfants, RDV...).</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  iconWrap: { alignItems: "center", marginVertical: 20 },
  iconBig: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  heroSub: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginTop: 8, paddingHorizontal: 10, lineHeight: 18 },
  label: { fontSize: 13, color: COLORS.textPrimary, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: 18, fontSize: 24, color: COLORS.textPrimary, textAlign: "center", letterSpacing: 6, fontWeight: "800" },
  relGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  relPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  relPillText: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary },
  btnBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: RADIUS.pill, ...SHADOW },
  btnBigText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  info: { flexDirection: "row", gap: 10, backgroundColor: "#EFF6FF", padding: 12, borderRadius: RADIUS.md, marginTop: 20, alignItems: "flex-start" },
  infoText: { flex: 1, color: "#1E40AF", fontSize: 12, lineHeight: 18 },
});
