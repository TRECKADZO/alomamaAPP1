import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { api, formatError } from "../lib/api";
import { cachedGet } from "../lib/offline";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

type Dossier = any;

export default function DossierScreen() {
  const router = useRouter();
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await cachedGet("/dossier");
      setData(r.data);
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const d = data || {};
  const p = d.patient || {};
  const g = d.grossesse;
  const enfants: any[] = d.enfants || [];
  const rdv: any[] = d.rdv || [];

  // --- Grossesse calculations (identical to grossesse tab) ---
  let info: any = null;
  if (g) {
    const today = new Date();
    const ddr = new Date(g.date_debut);
    const joursDepuisDDR = Math.floor((today.getTime() - ddr.getTime()) / 86400000);
    const semaines = Math.max(0, Math.floor(joursDepuisDDR / 7));
    const trimestre = semaines < 14 ? 1 : semaines < 28 ? 2 : 3;
    const dpa = g.date_terme ? new Date(g.date_terme) : new Date(ddr.getTime() + 280 * 86400000);
    info = { semaines, trimestre, dpa };
  }

  const generateHTML = () => {
    const rows = (title: string, lines: string[]) => `
      <h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">${title}</h2>
      <div style="line-height:1.6;color:#333;">${lines.join("<br/>")}</div>
    `;
    const enfantsHTML = enfants.map((e: any) => {
      const vaccins = (e.vaccins || []).map((v: any) =>
        `<li>${v.nom} — ${new Date(v.date).toLocaleDateString("fr-FR")}${v.prochain_rappel ? ` (rappel ${new Date(v.prochain_rappel).toLocaleDateString("fr-FR")})` : ""}</li>`
      ).join("");
      const mesures = (e.mesures || []).slice(-3).map((m: any) =>
        `<li>${new Date(m.date).toLocaleDateString("fr-FR")} — ${m.poids_kg || "?"} kg · ${m.taille_cm || "?"} cm</li>`
      ).join("");
      return `<div style="border:1px solid #eee;border-radius:8px;padding:10px;margin-top:10px;">
        <h3 style="margin:0 0 6px 0;color:#333;">${e.nom} (${e.sexe === "F" ? "♀" : "♂"}) — né(e) le ${new Date(e.date_naissance).toLocaleDateString("fr-FR")}</h3>
        ${e.groupe_sanguin ? `<p style="margin:2px 0;"><b>Groupe sanguin :</b> ${e.groupe_sanguin}</p>` : ""}
        ${(e.allergies || []).length ? `<p style="margin:2px 0;"><b>Allergies :</b> ${e.allergies.join(", ")}</p>` : ""}
        ${vaccins ? `<p style="margin:8px 0 2px 0;"><b>Vaccins :</b></p><ul style="margin:4px 0;">${vaccins}</ul>` : ""}
        ${mesures ? `<p style="margin:8px 0 2px 0;"><b>Mesures récentes :</b></p><ul style="margin:4px 0;">${mesures}</ul>` : ""}
      </div>`;
    }).join("");

    const rdvHTML = rdv.slice(0, 20).map((r: any) =>
      `<li>${new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
       — ${r.pro?.name || "Praticien"}${r.pro?.specialite ? ` (${r.pro.specialite})` : ""}
       — <i>${r.motif || ""}</i>
       — ${r.status}${r.mode === "teleconsultation" ? " · Téléconsultation" : " · Présentiel"}</li>`
    ).join("");

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin:30px; color:#333; }
        h1 { color:#C97B63; }
        .meta { color:#666; font-size:12px; margin-bottom:20px; }
        .intro { background:#FEF3E8; padding:16px; border-radius:8px; }
        ul { padding-left:22px; }
      </style></head><body>
      <h1>🌸 Dossier médical — ${p.nom || "Utilisatrice"}</h1>
      <div class="meta">Généré le ${new Date().toLocaleString("fr-FR")} · À lo Maman</div>
      <div class="intro">
        <p style="margin:0;"><b>Contact :</b> ${p.email || "—"}${p.phone ? " · " + p.phone : ""}</p>
        ${p.ville || p.region ? `<p style="margin:4px 0 0 0;"><b>Localisation :</b> ${[p.ville, p.region].filter(Boolean).join(" · ")}</p>` : ""}
      </div>
      ${g ? rows("🤰 Grossesse en cours", [
        `<b>${info.semaines} SA</b> · Trimestre ${info.trimestre}`,
        `Date des dernières règles : ${new Date(g.date_debut).toLocaleDateString("fr-FR")}`,
        `DPA prévue : ${info.dpa.toLocaleDateString("fr-FR")}`,
        (g.symptomes || []).length ? `Symptômes notés : ${g.symptomes.join(", ")}` : "",
      ].filter(Boolean)) : ""}
      ${enfants.length ? `<h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">👶 Enfants (${enfants.length})</h2>${enfantsHTML}` : ""}
      ${rdvHTML ? `<h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">📅 Historique des rendez-vous</h2><ul>${rdvHTML}</ul>` : ""}
      <div class="meta" style="margin-top:30px;">Document confidentiel généré par l'application À lo Maman.</div>
      </body></html>`;
  };

  const exportPDF = async () => {
    try {
      if (Platform.OS === "web") {
        // On web, open print dialog
        const w = (window as any).open("", "_blank");
        w.document.write(generateHTML());
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: generateHTML() });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Mon dossier médical" });
      } else {
        Alert.alert("PDF généré", uri);
      }
    } catch (e: any) {
      Alert.alert("Erreur PDF", formatError(e));
    }
  };

  const shareLink = async () => {
    setSharing(true);
    try {
      const { data: res } = await api.post("/dossier/share");
      const msg = `Bonjour 👋\nVoici un lien vers mon dossier médical (valable 7 jours) :\n${res.url}\n\n— Envoyé depuis À lo Maman`;
      if (Platform.OS === "web") {
        try {
          await Clipboard.setStringAsync(msg);
          Alert.alert("Lien copié ✅", `Le lien de partage a été copié dans le presse-papiers.\n\nURL : ${res.url}\nExpire le ${new Date(res.expires_at).toLocaleDateString("fr-FR")}`);
        } catch {
          Alert.alert("Lien généré", res.url);
        }
      } else {
        await Share.share({ message: msg, title: "Mon dossier médical" });
      }
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setSharing(false);
    }
  };

  const exportFHIR = async () => {
    try {
      const { data: bundle } = await api.get("/fhir/patient");
      const txt = JSON.stringify(bundle, null, 2);
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(txt);
        Alert.alert("JSON FHIR copié", "Le bundle FHIR a été copié dans le presse-papiers. À destination uniquement d'un professionnel de santé ou d'un logiciel médical compatible HL7.");
      } else {
        await Share.share({ message: txt, title: "Bundle FHIR (HL7)" });
      }
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Mon dossier médical</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}>
        {/* Identité */}
        <View style={[styles.card, { backgroundColor: COLORS.primaryLight }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.avatar}><Ionicons name="person" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{p.nom || "—"}</Text>
              {p.email ? <Text style={styles.patientMeta}>✉ {p.email}</Text> : null}
              {p.phone ? <Text style={styles.patientMeta}>📞 {p.phone}</Text> : null}
              {(p.ville || p.region) ? <Text style={styles.patientMeta}>📍 {[p.ville, p.region].filter(Boolean).join(" · ")}</Text> : null}
            </View>
          </View>
        </View>

        {/* Grossesse */}
        {g && info ? (
          <View style={styles.card}>
            <View style={styles.sectionTitle}><Ionicons name="heart" size={18} color="#D946EF" /><Text style={styles.sectionTitleText}>Grossesse en cours</Text></View>
            <Text style={styles.bigNumber}>{info.semaines} <Text style={styles.unit}>SA</Text></Text>
            <Text style={styles.sub}>Trimestre {info.trimestre} · DPA {info.dpa.toLocaleDateString("fr-FR")}</Text>
            <Text style={styles.meta}>DDR : {new Date(g.date_debut).toLocaleDateString("fr-FR")}</Text>
            {(g.symptomes || []).length > 0 && (
              <View style={styles.tags}>
                {g.symptomes.map((s: string, i: number) => (
                  <View key={i} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Enfants */}
        {enfants.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionTitle}><Ionicons name="people" size={18} color={COLORS.primary} /><Text style={styles.sectionTitleText}>Mes enfants ({enfants.length})</Text></View>
            {enfants.map((e: any) => {
              const age = Math.floor((Date.now() - new Date(e.date_naissance).getTime()) / (365.25 * 86400000));
              const vaccinsCount = (e.vaccins || []).length;
              return (
                <View key={e.id} style={styles.enfantRow}>
                  <Text style={styles.enfantEmoji}>{e.sexe === "F" ? "👧" : "👦"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.enfantName}>{e.nom}</Text>
                    <Text style={styles.enfantMeta}>{age} an{age > 1 ? "s" : ""} · {new Date(e.date_naissance).toLocaleDateString("fr-FR")}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {e.groupe_sanguin ? <View style={styles.badge}><Text style={styles.badgeText}>🩸 {e.groupe_sanguin}</Text></View> : null}
                      {vaccinsCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>💉 {vaccinsCount} vaccin{vaccinsCount > 1 ? "s" : ""}</Text></View> : null}
                      {(e.allergies || []).length > 0 ? <View style={[styles.badge, { backgroundColor: "#FEE2E2" }]}><Text style={[styles.badgeText, { color: "#991B1B" }]}>⚠ {e.allergies.length} allergie(s)</Text></View> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Rendez-vous récents */}
        {rdv.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionTitle}><Ionicons name="calendar" size={18} color={COLORS.primary} /><Text style={styles.sectionTitleText}>Derniers rendez-vous</Text></View>
            {rdv.slice(0, 5).map((r: any) => (
              <View key={r.id} style={styles.rdvRow}>
                <View style={styles.rdvDate}>
                  <Text style={styles.rdvDay}>{new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit" })}</Text>
                  <Text style={styles.rdvMonth}>{new Date(r.date).toLocaleDateString("fr-FR", { month: "short" })}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rdvPro}>{r.pro?.name || "Praticien"}</Text>
                  <Text style={styles.rdvMotif} numberOfLines={1}>{r.motif}</Text>
                  <Text style={styles.rdvMeta}>{r.mode === "teleconsultation" ? "📹 Téléconsultation" : "📍 Présentiel"} · {r.status}</Text>
                </View>
              </View>
            ))}
            {rdv.length > 5 ? <Text style={styles.more}>+ {rdv.length - 5} autres rendez-vous</Text> : null}
          </View>
        )}

        {enfants.length === 0 && !g && rdv.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Votre dossier est vide. Ajoutez des informations dans l'onglet Grossesse ou Enfants pour voir votre résumé ici.</Text>
          </View>
        )}

        {/* Actions */}
        <View style={{ height: 10 }} />
        <TouchableOpacity style={styles.btnPrimary} onPress={exportPDF} testID="export-pdf-btn">
          <Ionicons name="document-text" size={18} color="#fff" />
          <Text style={styles.btnPrimaryText}>Télécharger mon dossier (PDF)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={shareLink} disabled={sharing} testID="share-link-btn">
          {sharing ? <ActivityIndicator color={COLORS.primary} /> : (
            <>
              <Ionicons name="link" size={18} color={COLORS.primary} />
              <Text style={styles.btnSecondaryText}>Partager un lien sécurisé (7 jours)</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Advanced (FHIR) */}
        <TouchableOpacity style={styles.advancedToggle} onPress={() => setShowAdvanced((s) => !s)}>
          <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textSecondary} />
          <Text style={styles.advancedText}>Paramètres avancés</Text>
        </TouchableOpacity>
        {showAdvanced && (
          <View style={styles.advancedBox}>
            <Text style={styles.advancedLabel}>Format FHIR (HL7)</Text>
            <Text style={styles.advancedHelp}>Pour les professionnels de santé : exporte vos données au format standard FHIR (HL7), utilisable par un logiciel médical compatible.</Text>
            <TouchableOpacity style={styles.btnTertiary} onPress={exportFHIR}>
              <Ionicons name="code-slash" size={16} color={COLORS.textPrimary} />
              <Text style={styles.btnTertiaryText}>Exporter FHIR (JSON)</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.xl, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  sectionTitleText: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  avatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  patientName: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },
  patientMeta: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  bigNumber: { fontSize: 32, fontWeight: "800", color: "#D946EF" },
  unit: { fontSize: 16, color: COLORS.textSecondary, fontWeight: "600" },
  sub: { color: COLORS.textPrimary, fontWeight: "600", marginTop: 2 },
  meta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { backgroundColor: COLORS.secondaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 12, color: COLORS.textPrimary },
  enfantRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  enfantEmoji: { fontSize: 28 },
  enfantName: { fontSize: 15, fontWeight: "800", color: COLORS.textPrimary },
  enfantMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  badge: { backgroundColor: COLORS.secondaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary },
  rdvRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  rdvDate: { backgroundColor: COLORS.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, alignItems: "center", minWidth: 46 },
  rdvDay: { fontSize: 18, fontWeight: "800", color: COLORS.primary },
  rdvMonth: { fontSize: 10, fontWeight: "700", color: COLORS.primary, textTransform: "uppercase" },
  rdvPro: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  rdvMotif: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  rdvMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  more: { color: COLORS.textSecondary, fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 6 },
  empty: { alignItems: "center", padding: 30, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  emptyText: { textAlign: "center", color: COLORS.textSecondary, marginTop: 10, lineHeight: 20 },
  btnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.pill, marginTop: 10 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.surface, paddingVertical: 14, borderRadius: RADIUS.pill, marginTop: 10, borderWidth: 1.5, borderColor: COLORS.primary },
  btnSecondaryText: { color: COLORS.primary, fontWeight: "800" },
  advancedToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, paddingVertical: 8 },
  advancedText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  advancedBox: { marginTop: 6, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  advancedLabel: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 13 },
  advancedHelp: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  btnTertiary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.bgPrimary, paddingVertical: 10, borderRadius: RADIUS.md, marginTop: 10, borderWidth: 1, borderColor: COLORS.border },
  btnTertiaryText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
});
