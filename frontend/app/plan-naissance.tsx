import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Switch, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

const POSITIONS = ["Allongée sur le dos", "Allongée sur le côté", "Assise", "Accroupie", "Debout", "Dans l'eau", "À discuter avec mon médecin"];
const ANESTHESIES = ["Péridurale si possible", "Naturelle (sans péridurale)", "À voir le moment venu", "Refus catégorique"];
const ALLAITEMENTS = ["Allaitement maternel exclusif", "Allaitement mixte", "Biberon (lait infantile)", "À décider"];
const COUPE_CORDON = ["Mon conjoint", "Ma mère / sœur", "Le médecin / sage-femme", "Personne en particulier"];

const FIELDS = [
  { key: "lieu_souhaite", label: "📍 Lieu d'accouchement souhaité", placeholder: "Ex: Clinique Aurore — Abidjan", multiline: false },
  { key: "accompagnant", label: "🤝 Personne(s) souhaitée(s) à mes côtés", placeholder: "Nom de l'accompagnant principal", multiline: false },
  { key: "accompagnant_relation", label: "Relation avec l'accompagnant", placeholder: "Ex: conjoint, mère, sœur", multiline: false },
  { key: "musique", label: "🎵 Musique / ambiance sonore", placeholder: "Ex: musique douce, silence", multiline: false },
  { key: "ambiance", label: "💡 Ambiance générale", placeholder: "Ex: lumière tamisée, calme", multiline: false },
  { key: "placenta", label: "🌿 Placenta — vos souhaits", placeholder: "Ex: don, conservation, autre", multiline: false },
  { key: "visiteurs_apres", label: "👥 Visiteurs après la naissance", placeholder: "Ex: famille proche uniquement, premières 24h sans visite", multiline: true },
  { key: "en_cas_cesarienne", label: "🏥 En cas de césarienne", placeholder: "Ex: présence du conjoint, peau-à-peau le plus tôt", multiline: true },
  { key: "en_cas_complications", label: "⚠️ En cas de complications", placeholder: "Ex: privilégier la sécurité du bébé, prévenir mon conjoint", multiline: true },
  { key: "notes", label: "📝 Notes additionnelles", placeholder: "Tout ce que vous voulez ajouter", multiline: true },
];

const CHIPS_FIELDS: Array<{ key: string; label: string; options: string[] }> = [
  { key: "position_souhaitee", label: "🤰 Position souhaitée", options: POSITIONS },
  { key: "anesthesie", label: "💉 Anesthésie", options: ANESTHESIES },
  { key: "allaitement", label: "🍼 Allaitement", options: ALLAITEMENTS },
  { key: "coupe_cordon", label: "✂️ Coupe du cordon par", options: COUPE_CORDON },
];

export default function PlanNaissanceScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [form, setForm] = useState<any>({ peau_a_peau: true, photos_video: false });
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get("/plan-naissance").then((r) => r.data || {}),
      api.get("/auth/me").then((r) => r.data).catch(() => null),
    ]).then(([p, u]) => {
      setForm({ peau_a_peau: true, photos_video: false, ...p });
      setUser(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const update = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  const onSave = async () => {
    setSaving(true);
    try {
      await api.post("/plan-naissance", form);
      Alert.alert("✅ Plan enregistré", "Votre plan de naissance a été sauvegardé. Vous pouvez le télécharger en PDF pour le présenter à votre équipe médicale.");
    } catch (e) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const generateHTML = () => {
    const f = form;
    const userName = user?.name || "Maman";
    const yes = (b: boolean) => b ? "✅ Oui" : "❌ Non";
    const opt = (v: any) => v ? `${v}` : "<i>(non précisé)</i>";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #333; line-height: 1.6; }
        h1 { color: #DB2777; border-bottom: 3px solid #FBCFE8; padding-bottom: 8px; }
        h2 { color: #BE185D; margin-top: 24px; border-left: 4px solid #FBCFE8; padding-left: 10px; }
        .box { background: #FDF2F8; padding: 14px; border-radius: 8px; margin: 14px 0; }
        .label { color: #831843; font-weight: 700; }
        .value { color: #333; margin-left: 4px; }
        .meta { color: #888; font-size: 12px; margin-top: 24px; }
        ul { padding-left: 20px; }
      </style></head><body>
      <h1>🌸 Mon Plan de Naissance</h1>
      <div class="box">
        <p><span class="label">Maman :</span> <span class="value">${userName}</span></p>
        <p><span class="label">Date du plan :</span> <span class="value">${new Date().toLocaleDateString("fr-FR")}</span></p>
      </div>

      <h2>📍 Lieu et accompagnement</h2>
      <p><span class="label">Lieu souhaité :</span> <span class="value">${opt(f.lieu_souhaite)}</span></p>
      <p><span class="label">Personne à mes côtés :</span> <span class="value">${opt(f.accompagnant)}${f.accompagnant_relation ? ` (${f.accompagnant_relation})` : ""}</span></p>

      <h2>🤰 Travail et accouchement</h2>
      <p><span class="label">Position souhaitée :</span> <span class="value">${opt(f.position_souhaitee)}</span></p>
      <p><span class="label">Anesthésie :</span> <span class="value">${opt(f.anesthesie)}</span></p>
      <p><span class="label">Ambiance :</span> <span class="value">${opt(f.ambiance)}</span></p>
      <p><span class="label">Musique :</span> <span class="value">${opt(f.musique)}</span></p>

      <h2>👶 Après la naissance</h2>
      <p><span class="label">Peau-à-peau immédiat :</span> <span class="value">${yes(!!f.peau_a_peau)}</span></p>
      <p><span class="label">Coupe du cordon par :</span> <span class="value">${opt(f.coupe_cordon)}</span></p>
      <p><span class="label">Allaitement souhaité :</span> <span class="value">${opt(f.allaitement)}</span></p>
      <p><span class="label">Placenta :</span> <span class="value">${opt(f.placenta)}</span></p>
      <p><span class="label">Photos / vidéos :</span> <span class="value">${yes(!!f.photos_video)}</span></p>
      <p><span class="label">Visiteurs :</span> <span class="value">${opt(f.visiteurs_apres)}</span></p>

      <h2>⚠️ Cas particuliers</h2>
      <p><span class="label">En cas de césarienne :</span> <span class="value">${opt(f.en_cas_cesarienne)}</span></p>
      <p><span class="label">En cas de complications :</span> <span class="value">${opt(f.en_cas_complications)}</span></p>

      ${f.notes ? `<h2>📝 Notes additionnelles</h2><p class="value">${f.notes.replace(/\n/g, "<br/>")}</p>` : ""}

      <div class="meta">
        <p><b>Note pour l'équipe médicale :</b> Ce plan reflète mes préférences pour mon accouchement. Je comprends que la sécurité de mon bébé et la mienne priment, et que des ajustements peuvent être nécessaires en fonction de l'évolution médicale.</p>
        <p>Document généré le ${new Date().toLocaleString("fr-FR")} par l'application À lo Maman.</p>
      </div>
    </body></html>`;
  };

  const exportPDF = async () => {
    setPdfLoading(true);
    try {
      const html = generateHTML();
      if (Platform.OS === "web") {
        const w = (window as any).open("", "_blank");
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => w.print(), 400);
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Mon plan de naissance" });
      } else {
        await Share.share({ url: uri, message: "Mon plan de naissance" });
      }
    } catch (e: any) {
      Alert.alert("Erreur PDF", formatError(e));
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#EC4899", "#F472B6"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📋 Mon plan de naissance</Text>
          <Text style={styles.sub}>Mes souhaits pour le jour J</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {/* Intro */}
          <View style={styles.introBox}>
            <Ionicons name="heart" size={18} color="#BE185D" />
            <Text style={styles.introText}>
              Ce plan est un guide pour votre équipe médicale. Tout est ajustable selon l'évolution médicale.
            </Text>
          </View>

          {/* Chips fields */}
          {CHIPS_FIELDS.map((f) => (
            <View key={f.key} style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <View style={styles.chipsRow}>
                {f.options.map((opt) => {
                  const active = form[f.key] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => update(f.key, active ? null : opt)}
                      style={[styles.chip, active && styles.chipActive]}
                      testID={`chip-${f.key}-${opt}`}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Toggles */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>👶 Peau-à-peau immédiat avec bébé</Text>
            <Switch value={!!form.peau_a_peau} onValueChange={(v) => update("peau_a_peau", v)} trackColor={{ true: "#EC4899", false: "#D1D5DB" }} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>📸 J'autorise les photos / vidéos</Text>
            <Switch value={!!form.photos_video} onValueChange={(v) => update("photos_video", v)} trackColor={{ true: "#EC4899", false: "#D1D5DB" }} />
          </View>

          {/* Text fields */}
          {FIELDS.map((f) => (
            <View key={f.key} style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput
                style={[styles.input, f.multiline && { minHeight: 70, textAlignVertical: "top" }]}
                value={form[f.key] || ""}
                onChangeText={(t) => update(f.key, t)}
                placeholder={f.placeholder}
                placeholderTextColor={COLORS.textMuted}
                multiline={f.multiline}
                testID={`input-${f.key}`}
              />
            </View>
          ))}

          {/* Save + Export */}
          <TouchableOpacity onPress={onSave} disabled={saving} style={styles.btnSave} testID="save-plan-btn">
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
            <Text style={styles.btnSaveText}>{saving ? "Enregistrement..." : "Enregistrer mon plan"}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={exportPDF} disabled={pdfLoading} style={styles.btnPdf} testID="export-plan-pdf">
            {pdfLoading ? <ActivityIndicator color="#EC4899" /> : <Ionicons name="document-text" size={18} color="#EC4899" />}
            <Text style={styles.btnPdfText}>{pdfLoading ? "Génération..." : "Télécharger en PDF"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  introBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#FDF2F8", borderRadius: RADIUS.md, marginBottom: 14, borderWidth: 1, borderColor: "#FBCFE8" },
  introText: { flex: 1, color: "#9D174D", fontSize: 12, lineHeight: 16 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 13, marginBottom: 8 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: "#EC4899", borderColor: "#EC4899" },
  chipText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, fontSize: 13, color: COLORS.textPrimary },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4 },
  toggleLabel: { flex: 1, color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  btnSave: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EC4899", paddingVertical: 14, borderRadius: 999, marginTop: 16, ...SHADOW.sm },
  btnSaveText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnPdf: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FDF2F8", paddingVertical: 14, borderRadius: 999, marginTop: 10, borderWidth: 1.5, borderColor: "#EC4899" },
  btnPdfText: { color: "#EC4899", fontWeight: "800", fontSize: 14 },
});
