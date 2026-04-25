import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api, formatError } from "../../../lib/api";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../../constants/theme";

function ageOf(date_naissance: string) {
  const ms = Date.now() - new Date(date_naissance).getTime();
  const totalMonths = Math.floor(ms / (30.44 * 86400000));
  if (totalMonths < 12) return `${totalMonths} mois`;
  const annees = Math.floor(totalMonths / 12);
  const moisRestants = totalMonths % 12;
  return moisRestants > 0 ? `${annees} ans ${moisRestants} mois` : `${annees} ans`;
}

export default function CarnetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [enfant, setEnfant] = useState<any>(null);
  const [rdv, setRdv] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get("/enfants").then((r) => (r.data || []).find((e: any) => e.id === id)),
      api.get("/rdv").then((r) => (r.data || []).filter((x: any) => x.enfant_id === id)).catch(() => []),
    ]).then(([e, rs]) => {
      setEnfant(e);
      setRdv(rs);
      setLoading(false);
    });
  }, [id]);

  const generateHTML = () => {
    if (!enfant) return "";
    const vaccins = (enfant.vaccins || []).map((v: any) =>
      `<li><b>${v.nom}</b> — ${new Date(v.date).toLocaleDateString("fr-FR")}${v.prochain_rappel ? ` (rappel ${new Date(v.prochain_rappel).toLocaleDateString("fr-FR")})` : ""}</li>`
    ).join("");
    const mesures = (enfant.mesures || []).map((m: any) =>
      `<li>${new Date(m.date).toLocaleDateString("fr-FR")} — ${m.poids_kg ?? "?"} kg · ${m.taille_cm ?? "?"} cm${m.pc_cm ? ` · PC ${m.pc_cm} cm` : ""}</li>`
    ).join("");
    const rdvs = rdv.map((r: any) =>
      `<li>${new Date(r.date).toLocaleDateString("fr-FR")} — ${r.pro?.name || r.pro_nom || "Praticien"}${r.pro?.specialite ? ` (${r.pro.specialite})` : ""} — ${r.motif || ""} (${r.status})</li>`
    ).join("");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #333; line-height: 1.6; }
        h1 { color: #0F766E; border-bottom: 3px solid #A7F3D0; padding-bottom: 8px; }
        h2 { color: #C97B63; margin-top: 24px; border-left: 4px solid #FBCFE8; padding-left: 10px; }
        .meta { color: #888; font-size: 12px; }
        .info { background: #ECFDF5; padding: 14px; border-radius: 8px; }
        .empty { color: #999; font-style: italic; }
        ul { padding-left: 20px; }
      </style></head><body>
      <h1>📘 Carnet de santé — ${enfant.nom}</h1>
      <div class="meta">Généré le ${new Date().toLocaleString("fr-FR")} · À lo Maman</div>

      <div class="info">
        <p><b>Date de naissance :</b> ${new Date(enfant.date_naissance).toLocaleDateString("fr-FR")} (${ageOf(enfant.date_naissance)})</p>
        <p><b>Sexe :</b> ${enfant.sexe === "F" ? "Fille 👧" : "Garçon 👦"}</p>
        ${enfant.groupe_sanguin ? `<p><b>Groupe sanguin :</b> ${enfant.groupe_sanguin}</p>` : ""}
        ${enfant.numero_cmu ? `<p><b>CMU :</b> ${enfant.numero_cmu}</p>` : ""}
        ${(enfant.allergies || []).length ? `<p><b>Allergies :</b> ${enfant.allergies.join(", ")}</p>` : ""}
      </div>

      <h2>📊 Mesures (${(enfant.mesures || []).length})</h2>
      ${mesures ? `<ul>${mesures}</ul>` : '<p class="empty">Aucune mesure enregistrée</p>'}

      <h2>💉 Vaccins (${(enfant.vaccins || []).length})</h2>
      ${vaccins ? `<ul>${vaccins}</ul>` : '<p class="empty">Aucun vaccin enregistré</p>'}

      <h2>📅 Rendez-vous (${rdv.length})</h2>
      ${rdvs ? `<ul>${rdvs}</ul>` : '<p class="empty">Aucun rendez-vous</p>'}

      <p class="meta" style="margin-top: 30px;">Document confidentiel À lo Maman.</p>
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
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Carnet ${enfant.nom}` });
      } else {
        await Share.share({ url: uri });
      }
    } catch (e: any) {
      Alert.alert("Erreur", formatError(e));
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.primary} size="large" /></SafeAreaView>;
  if (!enfant) return <SafeAreaView style={styles.loading}><Text>Enfant introuvable</Text></SafeAreaView>;

  const prochainVaccin = (enfant.vaccins || [])
    .filter((v: any) => v.prochain_rappel && new Date(v.prochain_rappel) > new Date())
    .sort((a: any, b: any) => new Date(a.prochain_rappel).getTime() - new Date(b.prochain_rappel).getTime())[0];

  const lastMesure = (enfant.mesures || [])[0];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={enfant.sexe === "F" ? ["#EC4899", "#F472B6"] : ["#3B82F6", "#60A5FA"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📘 Carnet — {enfant.nom}</Text>
          <Text style={styles.sub}>{enfant.sexe === "F" ? "👧 Fille" : "👦 Garçon"} · {ageOf(enfant.date_naissance)}</Text>
        </View>
        <TouchableOpacity onPress={exportPDF} disabled={pdfLoading} style={styles.pdfBtn} testID="export-carnet-pdf">
          {pdfLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="document-text" size={20} color="#fff" />}
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 60 }}>
        {/* Identité */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>👶 Identité</Text>
          <Row label="Date de naissance" value={new Date(enfant.date_naissance).toLocaleDateString("fr-FR")} />
          <Row label="Sexe" value={enfant.sexe === "F" ? "Fille" : "Garçon"} />
          {enfant.groupe_sanguin && <Row label="Groupe sanguin" value={enfant.groupe_sanguin} />}
          {enfant.numero_cmu && <Row label="N° CMU" value={enfant.numero_cmu} />}
          {(enfant.allergies || []).length > 0 && <Row label="Allergies" value={enfant.allergies.join(", ")} valueColor="#DC2626" />}
        </View>

        {/* Mesures */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>📊 Mesures ({(enfant.mesures || []).length})</Text>
            <TouchableOpacity onPress={() => router.push(`/croissance/${enfant.id}`)} style={styles.miniBtn}>
              <Ionicons name="trending-up" size={14} color={COLORS.primary} />
              <Text style={styles.miniBtnText}>Courbes OMS</Text>
            </TouchableOpacity>
          </View>
          {lastMesure ? (
            <>
              <Row label="Dernier poids" value={`${lastMesure.poids_kg} kg`} valueColor={COLORS.primary} />
              <Row label="Dernière taille" value={`${lastMesure.taille_cm} cm`} valueColor={COLORS.primary} />
              {lastMesure.pc_cm && <Row label="Périmètre crânien" value={`${lastMesure.pc_cm} cm`} />}
              <Row label="Date" value={new Date(lastMesure.date).toLocaleDateString("fr-FR")} />
              <Text style={styles.histLabel}>Historique :</Text>
              {(enfant.mesures || []).slice(0, 5).map((m: any, i: number) => (
                <View key={i} style={styles.histRow}>
                  <Text style={styles.histDate}>{new Date(m.date).toLocaleDateString("fr-FR")}</Text>
                  <Text style={styles.histVal}>{m.poids_kg} kg · {m.taille_cm} cm</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.empty}>Aucune mesure enregistrée.</Text>
          )}
        </View>

        {/* Vaccins */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>💉 Vaccins ({(enfant.vaccins || []).length})</Text>
            {prochainVaccin && (
              <View style={styles.upcomingChip}>
                <Ionicons name="alarm" size={11} color="#92400E" />
                <Text style={styles.upcomingText}>Prochain : {prochainVaccin.nom}</Text>
              </View>
            )}
          </View>
          {(enfant.vaccins || []).length === 0 ? (
            <Text style={styles.empty}>Aucun vaccin enregistré.</Text>
          ) : (
            (enfant.vaccins || []).map((v: any, i: number) => (
              <View key={i} style={styles.vaccinRow}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.vaccinNom}>{v.nom}</Text>
                  <Text style={styles.vaccinDate}>
                    {new Date(v.date).toLocaleDateString("fr-FR")}
                    {v.prochain_rappel && ` · Rappel ${new Date(v.prochain_rappel).toLocaleDateString("fr-FR")}`}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* RDV */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📅 Rendez-vous ({rdv.length})</Text>
          {rdv.length === 0 ? (
            <Text style={styles.empty}>Aucun rendez-vous pour cet enfant.</Text>
          ) : (
            rdv.slice(0, 10).map((r: any) => (
              <View key={r.id} style={styles.rdvRow}>
                <Ionicons name="medical" size={16} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rdvDate}>{new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                  <Text style={styles.rdvMotif}>{r.pro?.name || r.pro_nom} · {r.motif || "—"}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: r.status === "confirme" ? "#DCFCE7" : "#FEF3C7" }]}>
                  <Text style={[styles.statusText, { color: r.status === "confirme" ? "#15803D" : "#92400E" }]}>{r.status}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Quick actions */}
        <Text style={styles.actionsTitle}>Actions rapides</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={() => router.push(`/jalons/${enfant.id}`)} style={[styles.actionBtn, { backgroundColor: "#10B981" }]} testID="goto-jalons">
            <Ionicons name="checkmark-done" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Étapes développement</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exportPDF} disabled={pdfLoading} style={[styles.actionBtn, { backgroundColor: "#0EA5E9" }]} testID="export-pdf-btn">
            <Ionicons name="document-text" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Exporter PDF</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.rowItem}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor, fontWeight: "800" } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: SPACING.lg, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  pdfBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.sm },
  sectionTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 15 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COLORS.bgPrimary, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  miniBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 11 },
  upcomingChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#FEF3C7", borderRadius: 999 },
  upcomingText: { color: "#92400E", fontWeight: "700", fontSize: 10 },
  rowItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "600" },
  rowValue: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700" },
  empty: { color: COLORS.textMuted, fontStyle: "italic", fontSize: 12, textAlign: "center", marginVertical: 8 },
  histLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 6, textTransform: "uppercase" },
  histRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  histDate: { color: COLORS.textSecondary, fontSize: 12 },
  histVal: { color: COLORS.textPrimary, fontSize: 12, fontWeight: "600" },
  vaccinRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  vaccinNom: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13 },
  vaccinDate: { color: COLORS.textSecondary, fontSize: 11, marginTop: 1 },
  rdvRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rdvDate: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 13 },
  rdvMotif: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: "800" },
  actionsTitle: { fontWeight: "800", color: COLORS.textPrimary, fontSize: 14, marginTop: 8, marginBottom: 8 },
  actionsRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 999, ...SHADOW.sm },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
