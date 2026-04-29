import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api, formatError } from "../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";

export default function DossierMedical() {
  const router = useRouter();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = async () => {
    try {
      const [g, en, r, rem, cy] = await Promise.all([
        api.get("/grossesse").catch(() => ({ data: null })),
        api.get("/enfants").catch(() => ({ data: [] })),
        api.get("/rdv").catch(() => ({ data: [] })),
        api.get("/reminders").catch(() => ({ data: [] })),
        api.get("/cycles").catch(() => ({ data: [] })),
      ]);
      setData({ grossesse: g.data, enfants: en.data, rdv: r.data, reminders: rem.data, cycles: cy.data });
    } finally { setLoading(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const generateHTML = () => {
    const u = data?.user_name || "Utilisatrice";
    const gObj = data?.grossesse;
    const weeks = gObj?.date_debut ? Math.floor((Date.now() - new Date(gObj.date_debut).getTime()) / (7 * 86400000)) : 0;
    const enfantsList = data?.enfants || [];
    const rdvList = data?.rdv || [];
    const remindersList = (data?.reminders || []).filter((r: any) => !r.done);

    const enfantsHTML = enfantsList.map((e: any) => {
      const vaccins = (e.vaccins || []).map((v: any) =>
        `<li>${v.nom} — ${new Date(v.date).toLocaleDateString("fr-FR")}${v.prochain_rappel ? ` (rappel ${new Date(v.prochain_rappel).toLocaleDateString("fr-FR")})` : ""}</li>`
      ).join("");
      const mesures = (e.mesures || []).slice(-3).map((m: any) =>
        `<li>${new Date(m.date).toLocaleDateString("fr-FR")} — ${m.poids_kg ?? "?"} kg · ${m.taille_cm ?? "?"} cm</li>`
      ).join("");
      return `<div style="border:1px solid #eee;border-radius:8px;padding:10px;margin-top:10px;">
        <h3 style="margin:0 0 6px 0;color:#333;">${e.nom} (${e.sexe === "F" ? "♀" : "♂"}) — né(e) le ${new Date(e.date_naissance).toLocaleDateString("fr-FR")}</h3>
        ${e.groupe_sanguin ? `<p style="margin:2px 0;"><b>Groupe sanguin :</b> ${e.groupe_sanguin}</p>` : ""}
        ${(e.allergies || []).length ? `<p style="margin:2px 0;"><b>Allergies :</b> ${e.allergies.join(", ")}</p>` : ""}
        ${vaccins ? `<p style="margin:8px 0 2px 0;"><b>Vaccins :</b></p><ul style="margin:4px 0;">${vaccins}</ul>` : ""}
        ${mesures ? `<p style="margin:8px 0 2px 0;"><b>Mesures récentes :</b></p><ul style="margin:4px 0;">${mesures}</ul>` : ""}
      </div>`;
    }).join("");

    const rdvHTML = rdvList.slice(0, 20).map((r: any) =>
      `<li>${new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
       — ${r.pro?.name || r.pro_nom || "Praticien"}${r.pro?.specialite ? ` (${r.pro.specialite})` : ""}
       — <i>${r.motif || ""}</i>
       — ${r.status}${r.mode === "teleconsultation" ? " · Téléconsultation" : " · Présentiel"}</li>`
    ).join("");

    const remindersHTML = remindersList.slice(0, 30).map((r: any) =>
      `<li>${new Date(r.due_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} — <b>${r.title || ""}</b> ${r.description || r.note || ""}</li>`
    ).join("");

    const grossesseBlock = gObj ? `
      <h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">🤰 Grossesse en cours</h2>
      <div style="line-height:1.6;color:#333;">
        <b>${weeks} SA</b><br/>
        Date des dernières règles : ${gObj.date_debut ? new Date(gObj.date_debut).toLocaleDateString("fr-FR") : "—"}<br/>
        ${gObj.date_terme ? `DPA prévue : ${new Date(gObj.date_terme).toLocaleDateString("fr-FR")}<br/>` : ""}
        ${gObj.groupe_sanguin ? `Groupe sanguin : ${gObj.groupe_sanguin}` : ""}
      </div>` : "";

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin:30px; color:#333; }
        h1 { color:#0F766E; }
        .meta { color:#666; font-size:12px; margin-bottom:20px; }
        .intro { background:#ECFDF5; padding:16px; border-radius:8px; }
        ul { padding-left:22px; }
      </style></head><body>
      <h1>🌸 Dossier médical — ${u}</h1>
      <div class="meta">Généré le ${new Date().toLocaleString("fr-FR")} · À lo Maman</div>
      <div class="intro">
        <p style="margin:0;">Ce document est confidentiel. Il contient un résumé de votre suivi médical sur l'application À lo Maman.</p>
      </div>
      ${grossesseBlock}
      ${enfantsList.length ? `<h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">👶 Enfants (${enfantsList.length})</h2>${enfantsHTML}` : ""}
      ${rdvHTML ? `<h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">📅 Historique des rendez-vous</h2><ul>${rdvHTML}</ul>` : ""}
      ${remindersHTML ? `<h2 style="color:#C97B63;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:24px;">⏰ Rappels actifs</h2><ul>${remindersHTML}</ul>` : ""}
      <div class="meta" style="margin-top:30px;">Document confidentiel généré par l'application À lo Maman.</div>
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
        } else {
          Alert.alert("PDF", "Veuillez autoriser les pop-ups pour imprimer.");
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Mon dossier médical" });
      } else {
        await Share.share({ url: uri, message: "Mon dossier médical (PDF)" });
      }
    } catch (e: any) {
      Alert.alert("Erreur PDF", formatError(e));
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} /></SafeAreaView>;

  const g = data.grossesse;
  const weeksSA = g?.date_debut ? Math.floor((Date.now() - new Date(g.date_debut).getTime()) / (7 * 86400000)) : 0;
  const totalVaccins = (data.enfants || []).reduce((s: number, e: any) => s + ((e.vaccins || []).length), 0);
  const vaccinsAVenir = (data.enfants || []).flatMap((e: any) => (e.vaccins || []).filter((v: any) => v.prochain_rappel && new Date(v.prochain_rappel) > new Date())).length;
  const remindersActifs = (data.reminders || []).filter((r: any) => !r.done).length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={["#14B8A6", "#06B6D4"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mon dossier médical</Text>
          <Text style={styles.sub}>Vue synthétique de votre santé</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/fhir")} style={styles.exportBtn}>
          <Ionicons name="cloud-download" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 60 }}>
        {/* Stats globales */}
        <View style={styles.statsGrid}>
          <StatCard icon="heart" label="Grossesse" value={g ? `${weeksSA} SA` : "-"} color="#EC4899" onPress={() => router.push("/(tabs)/grossesse")} />
          <StatCard icon="happy" label="Enfants" value={String((data.enfants || []).length)} color="#3B82F6" onPress={() => router.push("/(tabs)/enfants")} />
          <StatCard icon="medkit" label="Vaccins" value={String(totalVaccins)} color="#10B981" onPress={() => router.push("/(tabs)/enfants")} />
          <StatCard icon="calendar" label="RDV" value={String((data.rdv || []).length)} color="#A855F7" onPress={() => router.push("/(tabs)/rdv")} />
          <StatCard icon="alarm" label="Rappels" value={String(remindersActifs)} color="#F59E0B" onPress={() => router.push("/reminders")} />
          <StatCard icon="flower" label="Cycles" value={String((data.cycles || []).length)} color="#E11D48" onPress={() => router.push("/cycle")} />
        </View>

        {/* Section grossesse */}
        {g && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <LinearGradient colors={["#F472B6", "#FB7185"]} style={styles.cardIcon}><Ionicons name="heart" size={18} color="#fff" /></LinearGradient>
              <Text style={styles.cardTitle}>Suivi grossesse</Text>
            </View>
            <View style={styles.row}><Text style={styles.label}>SA</Text><Text style={styles.value}>{weeksSA}</Text></View>
            {g.date_debut && <View style={styles.row}><Text style={styles.label}>Début</Text><Text style={styles.value}>{new Date(g.date_debut).toLocaleDateString("fr-FR")}</Text></View>}
            {g.date_terme && <View style={styles.row}><Text style={styles.label}>DPA</Text><Text style={styles.value}>{new Date(g.date_terme).toLocaleDateString("fr-FR")}</Text></View>}
            {g.groupe_sanguin && <View style={styles.row}><Text style={styles.label}>Groupe</Text><Text style={styles.value}>{g.groupe_sanguin}</Text></View>}
          </View>
        )}

        {/* Section enfants */}
        {(data.enfants || []).length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <LinearGradient colors={["#3B82F6", "#06B6D4"]} style={styles.cardIcon}><Ionicons name="happy" size={18} color="#fff" /></LinearGradient>
              <Text style={styles.cardTitle}>Enfants ({(data.enfants || []).length})</Text>
            </View>
            {data.enfants.map((e: any) => (
              <View key={e.id} style={styles.childItem}>
                <Text style={styles.childEmoji}>{e.sexe === "F" ? "\u{1F467}" : "\u{1F466}"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.childName}>{e.nom}</Text>
                  <Text style={styles.childMeta}>Né(e) le {new Date(e.date_naissance).toLocaleDateString("fr-FR")} · {(e.vaccins || []).length} vaccin(s)</Text>
                </View>
              </View>
            ))}
            {vaccinsAVenir > 0 && (
              <View style={styles.alertBox}>
                <Ionicons name="alert-circle" size={16} color="#D97706" />
                <Text style={styles.alertText}>{vaccinsAVenir} vaccin(s) à venir prochainement</Text>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        <TouchableOpacity onPress={exportPDF} disabled={pdfLoading} testID="dossier-pdf-btn">
          <LinearGradient colors={["#0F766E", "#14B8A6"]} style={styles.btnAction}>
            {pdfLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text" size={18} color="#fff" />}
            <Text style={styles.btnActionText}>{pdfLoading ? "Génération..." : "Télécharger mon dossier (PDF)"}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/documents")}>
          <LinearGradient colors={["#14B8A6", "#06B6D4"]} style={styles.btnAction}>
            <Ionicons name="folder" size={18} color="#fff" />
            <Text style={styles.btnActionText}>Mes documents médicaux</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/fhir")}>
          <LinearGradient colors={["#0EA5E9", "#3B82F6"]} style={styles.btnAction}>
            <Ionicons name="cloud-download" size={18} color="#fff" />
            <Text style={styles.btnActionText}>Exporter mon dossier (FHIR)</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/sync")}>
          <LinearGradient colors={["#A855F7", "#7C3AED"]} style={styles.btnAction}>
            <Ionicons name="sync" size={18} color="#fff" />
            <Text style={styles.btnActionText}>État de la synchronisation</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value, color, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  exportBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { width: "31%", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, ...SHADOW },
  statIcon: { width: 40, height: 40, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statValue: { fontWeight: "800", fontSize: 18 },
  statLabel: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: 16, ...SHADOW },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  label: { color: COLORS.textSecondary, fontSize: 12 },
  value: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  childItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  childEmoji: { fontSize: 24 },
  childName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },
  childMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  alertBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: RADIUS.md, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", marginTop: 10 },
  alertText: { color: "#9A3412", fontSize: 12, fontWeight: "600", flex: 1 },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: "800", fontSize: 14, marginTop: 16, marginBottom: 10 },
  btnAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: RADIUS.pill, marginBottom: 10 },
  btnActionText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
