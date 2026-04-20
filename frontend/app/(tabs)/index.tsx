import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { COLORS, IMAGES, RADIUS, SHADOW, SPACING } from "../../constants/theme";

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      if (user?.role === "maman") {
        const [g, enfants, rdv, rem] = await Promise.all([
          api.get("/grossesse").catch(() => ({ data: null })),
          api.get("/enfants").catch(() => ({ data: [] })),
          api.get("/rdv").catch(() => ({ data: [] })),
          api.get("/reminders").catch(() => ({ data: [] })),
        ]);
        setData({ grossesse: g.data, enfants: enfants.data, rdv: rdv.data, reminders: rem.data });
      } else if (user?.role === "professionnel") {
        const [patients, rdv] = await Promise.all([
          api.get("/pro/patients").catch(() => ({ data: [] })),
          api.get("/rdv").catch(() => ({ data: [] })),
        ]);
        setData({ patients: patients.data, rdv: rdv.data });
      } else if (user?.role === "admin") {
        const stats = await api.get("/admin/stats").catch(() => ({ data: {} }));
        setData({ stats: stats.data });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {user?.role === "maman" && <MamanDash user={user} data={data} router={router} />}
        {user?.role === "professionnel" && <ProDash user={user} data={data} router={router} />}
        {user?.role === "admin" && <AdminDash user={user} data={data} router={router} />}
        {user?.role === "centre_sante" && <CentreDash user={user} router={router} />}
        {user?.role === "famille" && <FamilleDash user={user} router={router} />}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===========================================================
   DASHBOARD MAMAN — aligné sur src/pages/DashboardMaman.jsx
   =========================================================== */
function MamanDash({ user, data, router }: any) {
  const g = data.grossesse;
  const enfants = data.enfants || [];
  const rdvList = (data.rdv || []).filter((r: any) => r.status !== "termine" && r.statut !== "termine");
  const reminders = (data.reminders || []).filter((r: any) => !r.done).slice(0, 3);
  const documents = data.documents || [];

  // Calculs grossesse
  const weeksRaw = g?.date_debut
    ? Math.floor((Date.now() - new Date(g.date_debut).getTime()) / (7 * 24 * 3600 * 1000))
    : 0;
  const weeks = Math.min(Math.max(weeksRaw, 0), 40);
  const trimestre = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
  const dpa = g?.date_terme ? new Date(g.date_terme) : g?.date_debut ? new Date(new Date(g.date_debut).getTime() + 280 * 86400000) : null;
  const joursRestants = dpa ? Math.max(0, Math.floor((dpa.getTime() - Date.now()) / 86400000)) : 0;
  const progression = Math.min(100, Math.round((Math.min(weeks, 40) / 40) * 100));

  // Prochain RDV
  const prochainsRDV = (rdvList || [])
    .filter((r: any) => new Date(r.date) >= new Date())
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  // Alertes IA simples (basées sur les données existantes)
  const alertes: { type: string; text: string; color: string }[] = [];
  if (g && weeks >= 28 && weeks <= 32) {
    alertes.push({ type: "info", text: "Pensez à votre vaccin coqueluche (28-32 SA)", color: "#A855F7" });
  }
  if (enfants.length > 0) {
    enfants.forEach((e: any) => {
      const vaccinsRappel = (e.vaccins || []).filter((v: any) => v.prochain_rappel && new Date(v.prochain_rappel) > new Date());
      if (vaccinsRappel.length > 0) {
        alertes.push({ type: "vaccin", text: `${e.nom || e.prenom} : prochain vaccin à venir`, color: "#F59E0B" });
      }
    });
  }

  return (
    <View>
      {/* Bienvenue — gradient pink-purple comme la source */}
      <LinearGradient
        colors={["#FCE7F3", "#F3E8FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.welcomeCard}
      >
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle} testID="dashboard-name">
              Bonjour {user?.name?.split(" ")[0] || "Maman"} ! 👋
            </Text>
            <Text style={styles.welcomeSub}>Votre tableau de bord personnalisé</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={styles.welcomeBtn}
              onPress={() => Alert.alert("Rapport PDF", "Génération du rapport bientôt disponible")}
              testID="rapport-pdf-btn"
            >
              <Ionicons name="sparkles" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.welcomeBtn}
              onPress={() => router.push("/(tabs)/profil")}
              testID="settings-btn"
            >
              <Ionicons name="settings-outline" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.welcomeBtn}
              onPress={() => router.push("/notifications")}
              testID="notif-btn"
            >
              <Ionicons name="notifications-outline" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {/* SectionSuiviGrossesse — affichée seulement si grossesse active */}
        {g ? (
          <LinearGradient
            colors={
              trimestre === 1
                ? ["#FCE7F3", "#FBCFE8"]
                : trimestre === 2
                ? ["#F3E8FF", "#E9D5FF"]
                : ["#DBEAFE", "#BFDBFE"]
            }
            style={styles.grossesseCard}
          >
            <View style={styles.grossesseHead}>
              <View>
                <Text style={[styles.trimBadge, { color: trimestre === 1 ? "#BE185D" : trimestre === 2 ? "#7E22CE" : "#1D4ED8" }]}>
                  TRIMESTRE {trimestre}
                </Text>
                <Text style={styles.grossesseWeeks}>{weeks} SA</Text>
                <Text style={styles.grossesseSub}>Votre bébé grandit chaque jour 💛</Text>
              </View>
              <View style={styles.progressRing}>
                <Text style={styles.progressRingValue}>{progression}%</Text>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progression}%` }]} />
            </View>
            <View style={styles.grossesseInfos}>
              {dpa && (
                <View style={styles.grossesseInfoItem}>
                  <Text style={styles.grossesseInfoLabel}>DPA</Text>
                  <Text style={styles.grossesseInfoValue}>
                    {dpa.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </Text>
                </View>
              )}
              <View style={styles.grossesseInfoItem}>
                <Text style={styles.grossesseInfoLabel}>Restants</Text>
                <Text style={styles.grossesseInfoValue}>{joursRestants} j</Text>
              </View>
              <TouchableOpacity
                style={styles.grossesseAction}
                onPress={() => router.push("/(tabs)/grossesse")}
              >
                <Text style={styles.grossesseActionText}>Voir le suivi</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        ) : (
          <View style={styles.heroCard} testID="hero-card">
            <Image source={{ uri: IMAGES.heroMaman }} style={styles.heroImg} />
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <Text style={styles.heroLabel}>BIENVENUE</Text>
              <Text style={styles.heroTitle}>Votre santé compte</Text>
              <Text style={styles.heroSub}>Démarrez votre suivi grossesse</Text>
              <TouchableOpacity
                style={styles.heroBtn}
                onPress={() => router.push("/(tabs)/grossesse")}
                testID="start-grossesse-btn"
              >
                <Text style={styles.heroBtnText}>Démarrer</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Grille de widgets : Prochains RDV + Alertes IA + Enfants + Documents */}
        <Text style={styles.sectionTitle}>Mes widgets</Text>

        {/* Widget Prochains RDV */}
        <View style={styles.widget}>
          <View style={styles.widgetHead}>
            <View style={styles.widgetTitleWrap}>
              <View style={[styles.widgetIcon, { backgroundColor: "#FCE7F3" }]}>
                <Ionicons name="calendar" size={18} color="#EC4899" />
              </View>
              <Text style={styles.widgetTitle}>Prochains rendez-vous</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(tabs)/rdv")}>
              <Text style={styles.linkText}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          {prochainsRDV.length === 0 ? (
            <Text style={styles.emptyMini}>Aucun rendez-vous à venir</Text>
          ) : (
            prochainsRDV.map((r: any) => (
              <View key={r.id} style={styles.widgetRow}>
                <View style={[styles.widgetRowIcon, { backgroundColor: "#FCE7F3" }]}>
                  <Ionicons name="medical" size={16} color="#EC4899" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.widgetRowTitle}>{r.pro_name || "Professionnel"}</Text>
                  <Text style={styles.widgetRowSub}>
                    {r.motif || "RDV"} · {new Date(r.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </Text>
                </View>
                <Text style={[styles.statusBadge, { backgroundColor: r.statut === "confirme" ? "#DCFCE7" : "#FEF3C7", color: r.statut === "confirme" ? "#166534" : "#92400E" }]}>
                  {r.statut || r.status || "en_attente"}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Widget Alertes IA */}
        <View style={styles.widget}>
          <View style={styles.widgetHead}>
            <View style={styles.widgetTitleWrap}>
              <View style={[styles.widgetIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="alert-circle" size={18} color="#D97706" />
              </View>
              <Text style={styles.widgetTitle}>Alertes & conseils IA</Text>
            </View>
          </View>
          {alertes.length === 0 ? (
            <Text style={styles.emptyMini}>Tout va bien, aucune alerte</Text>
          ) : (
            alertes.map((a, i) => (
              <View key={i} style={[styles.alertRow, { borderLeftColor: a.color }]}>
                <Ionicons name="information-circle" size={18} color={a.color} />
                <Text style={styles.alertText}>{a.text}</Text>
              </View>
            ))
          )}
        </View>

        {/* Widget Enfants */}
        <View style={styles.widget}>
          <View style={styles.widgetHead}>
            <View style={styles.widgetTitleWrap}>
              <View style={[styles.widgetIcon, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="people" size={18} color="#2563EB" />
              </View>
              <Text style={styles.widgetTitle}>Mes enfants ({enfants.length})</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(tabs)/enfants")}>
              <Text style={styles.linkText}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          {enfants.length === 0 ? (
            <Text style={styles.emptyMini}>Aucun enfant enregistré</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              {enfants.map((e: any) => {
                const ans = Math.floor((Date.now() - new Date(e.date_naissance).getTime()) / (365 * 86400000));
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.childChip}
                    onPress={() => router.push("/(tabs)/enfants")}
                  >
                    <Text style={styles.childEmoji}>{e.sexe === "F" ? "👧" : "👦"}</Text>
                    <Text style={styles.childName} numberOfLines={1}>{e.nom || e.prenom}</Text>
                    <Text style={styles.childAge}>{ans} an(s)</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Widget Rappels */}
        <View style={styles.widget}>
          <View style={styles.widgetHead}>
            <View style={styles.widgetTitleWrap}>
              <View style={[styles.widgetIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="alarm" size={18} color="#DC2626" />
              </View>
              <Text style={styles.widgetTitle}>Mes rappels</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/reminders")}>
              <Text style={styles.linkText}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          {reminders.length === 0 ? (
            <Text style={styles.emptyMini}>Aucun rappel actif</Text>
          ) : (
            reminders.map((r: any) => (
              <View key={r.id} style={styles.widgetRow}>
                <View style={[styles.widgetRowIcon, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="alarm" size={16} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.widgetRowTitle}>{r.title}</Text>
                  <Text style={styles.widgetRowSub}>{new Date(r.due_at).toLocaleDateString("fr-FR")}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Accès rapide complet */}
        <Text style={styles.sectionTitle}>Accès rapide</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="calendar" label="RDV" onPress={() => router.push("/(tabs)/rdv")} testID="qa-rdv" color="#EC4899" />
          <QuickAction icon="sparkles" label="Assistant" onPress={() => router.push("/(tabs)/assistant")} testID="qa-ia" color="#A855F7" />
          <QuickAction icon="people" label="Enfants" onPress={() => router.push("/(tabs)/enfants")} testID="qa-enfants" color="#3B82F6" />
          <QuickAction icon="chatbubbles" label="Communauté" onPress={() => router.push("/(tabs)/communaute")} testID="qa-com" color="#10B981" />
          <QuickAction icon="flower" label="Cycle" onPress={() => router.push("/cycle")} testID="qa-cycle" color="#E11D48" />
          <QuickAction icon="shield-checkmark" label="Contracep." onPress={() => router.push("/contraception")} testID="qa-contra" color="#F59E0B" />
          <QuickAction icon="heart-circle" label="Post-partum" onPress={() => router.push("/post-partum")} testID="qa-postpartum" color="#06B6D4" />
          <QuickAction icon="search" label="Rechercher" onPress={() => router.push("/search")} testID="qa-search" color="#6366F1" />
          <QuickAction icon="search" label="Centres" onPress={() => router.push("/centres")} testID="qa-centres" color="#A855F7" />
          <QuickAction icon="people-circle" label="Famille" onPress={() => router.push("/famille")} testID="qa-famille" color="#F59E0B" />
          <QuickAction icon="scan" label="Échographie" onPress={() => router.push("/tele-echo")} testID="qa-echo" color="#8B5CF6" />
          <QuickAction icon="document-text" label="Naissance" onPress={() => router.push("/naissance")} testID="qa-naiss" color="#14B8A6" />
          <QuickAction icon="shield" label="FHIR" onPress={() => router.push("/fhir")} testID="qa-fhir" color="#0EA5E9" />
          <QuickAction icon="diamond" label="Premium" onPress={() => router.push("/premium")} testID="qa-premium" color="#F59E0B" />
        </View>
      </View>
    </View>
  );
}

/* ===========================================================
   DASHBOARD PROFESSIONNEL
   =========================================================== */
function ProDash({ user, data, router }: any) {
  const patients = data.patients || [];
  const rdvToday = (data.rdv || []).filter((r: any) => {
    const d = new Date(r.date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  return (
    <View>
      <LinearGradient colors={["#DBEAFE", "#BFDBFE"]} style={styles.welcomeCard}>
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>Bonjour Dr. {user?.name?.split(" ").slice(-1)[0] || ""}</Text>
            <Text style={styles.welcomeSub}>Espace professionnel</Text>
          </View>
          <TouchableOpacity style={styles.welcomeBtn} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{patients.length}</Text>
            <Text style={styles.metricLabel}>Patientes</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{(data.rdv || []).length}</Text>
            <Text style={styles.metricLabel}>RDV Total</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{rdvToday.length}</Text>
            <Text style={styles.metricLabel}>Aujourd'hui</Text>
          </View>
        </View>

        <View style={styles.widget}>
          <Text style={styles.widgetTitle}>RDV du jour</Text>
          {rdvToday.length === 0 ? (
            <Text style={styles.emptyMini}>Aucun RDV aujourd'hui</Text>
          ) : (
            rdvToday.map((r: any) => (
              <View key={r.id} style={styles.widgetRow}>
                <View style={[styles.widgetRowIcon, { backgroundColor: "#DBEAFE" }]}>
                  <Ionicons name="time" size={16} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.widgetRowTitle}>{r.maman_name}</Text>
                  <Text style={styles.widgetRowSub}>
                    {r.motif} ·{" "}
                    {new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: COLORS.primary, marginTop: 16 }]}
          onPress={() => router.push("/(tabs)/patients")}
        >
          <Text style={styles.btnText}>Voir mes patientes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ===========================================================
   DASHBOARD ADMIN
   =========================================================== */
function AdminDash({ user, data, router }: any) {
  const s = data.stats || {};
  return (
    <View>
      <LinearGradient colors={[COLORS.primary, "#A64A35"]} style={styles.welcomeCard}>
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.welcomeTitle, { color: "#fff" }]}>Console Admin</Text>
            <Text style={[styles.welcomeSub, { color: "#FFE7E0" }]}>À lo Maman</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Statistiques</Text>
        <View style={styles.statGrid}>
          <StatCard icon="people" label="Utilisateurs" value={s.users ?? 0} color={COLORS.primary} />
          <StatCard icon="heart" label="Mamans" value={s.mamans ?? 0} color="#EC4899" />
          <StatCard icon="medkit" label="Pros" value={s.professionnels ?? 0} color="#3B82F6" />
          <StatCard icon="calendar" label="RDV" value={s.rdv ?? 0} color="#A855F7" />
          <StatCard icon="happy" label="Enfants" value={s.enfants ?? 0} color="#10B981" />
          <StatCard icon="chatbubbles" label="Posts" value={s.posts ?? 0} color="#F59E0B" />
        </View>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: COLORS.primary, marginTop: 16 }]}
          onPress={() => router.push("/(tabs)/admin")}
        >
          <Text style={styles.btnText}>Gérer les utilisateurs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ===========================================================
   DASHBOARD CENTRE DE SANTÉ
   =========================================================== */
function CentreDash({ user, router }: any) {
  const [centre, setCentre] = useState<any>(null);
  const loadCentre = async () => {
    try {
      const { data } = await api.get("/centres/mine");
      setCentre(data);
    } catch {
      setCentre(null);
    }
  };
  useFocusEffect(useCallback(() => { loadCentre(); }, []));

  return (
    <View>
      <LinearGradient colors={["#A855F7", "#6366F1"]} style={styles.welcomeCard}>
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.welcomeTitle, { color: "#fff" }]}>
              {centre?.nom_centre || user?.name}
            </Text>
            <Text style={[styles.welcomeSub, { color: "#E9D5FF" }]}>Espace centre de santé</Text>
          </View>
          <TouchableOpacity style={styles.welcomeBtn} onPress={() => router.push("/(tabs)/profil")}>
            <Ionicons name="settings-outline" size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {centre ? (
          <>
            <View style={styles.widget}>
              <View style={styles.widgetHead}>
                <View style={styles.widgetTitleWrap}>
                  <View style={[styles.widgetIcon, { backgroundColor: "#F3E8FF" }]}>
                    <Ionicons name="key" size={18} color="#7E22CE" />
                  </View>
                  <Text style={styles.widgetTitle}>Code d'invitation</Text>
                </View>
              </View>
              <Text style={[styles.welcomeTitle, { color: "#7E22CE", textAlign: "center", letterSpacing: 4, marginTop: 8 }]}>
                {centre.code_invitation}
              </Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                Partagez ce code avec vos professionnels pour qu'ils rejoignent votre centre
              </Text>
            </View>

            <View style={styles.widget}>
              <Text style={styles.widgetTitle}>Informations du centre</Text>
              {centre.type_etablissement && (
                <View style={styles.widgetRow}>
                  <View style={[styles.widgetRowIcon, { backgroundColor: "#F3E8FF" }]}>
                    <Ionicons name="business" size={16} color="#7E22CE" />
                  </View>
                  <Text style={{ color: COLORS.textSecondary, flex: 1 }}>Type</Text>
                  <Text style={styles.widgetRowTitle}>{centre.type_etablissement}</Text>
                </View>
              )}
              {centre.adresse && (
                <View style={styles.widgetRow}>
                  <View style={[styles.widgetRowIcon, { backgroundColor: "#F3E8FF" }]}>
                    <Ionicons name="location" size={16} color="#7E22CE" />
                  </View>
                  <Text style={[styles.widgetRowTitle, { flex: 1 }]} numberOfLines={2}>{centre.adresse}</Text>
                </View>
              )}
              {centre.ville && (
                <View style={styles.widgetRow}>
                  <View style={[styles.widgetRowIcon, { backgroundColor: "#F3E8FF" }]}>
                    <Ionicons name="map" size={16} color="#7E22CE" />
                  </View>
                  <Text style={[styles.widgetRowTitle, { flex: 1 }]}>{centre.ville} · {centre.region}</Text>
                </View>
              )}
              {centre.email_contact && (
                <View style={styles.widgetRow}>
                  <View style={[styles.widgetRowIcon, { backgroundColor: "#F3E8FF" }]}>
                    <Ionicons name="mail" size={16} color="#7E22CE" />
                  </View>
                  <Text style={[styles.widgetRowTitle, { flex: 1 }]}>{centre.email_contact}</Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.quickGrid}>
              <QuickAction icon="people" label="Pros" onPress={() => router.push("/(tabs)/patients")} color="#A855F7" />
              <QuickAction icon="calendar" label="Agenda" onPress={() => router.push("/(tabs)/rdv")} color="#3B82F6" />
              <QuickAction icon="search" label="Annuaire" onPress={() => router.push("/centres")} color="#10B981" />
              <QuickAction icon="diamond" label="Premium" onPress={() => router.push("/premium")} color="#F59E0B" />
            </View>
          </>
        ) : (
          <View style={styles.widget}>
            <Text style={styles.widgetTitle}>Centre non trouvé</Text>
            <Text style={{ color: COLORS.textSecondary, marginTop: 8 }}>
              Recréez votre profil ou contactez le support.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ===========================================================
   DASHBOARD FAMILLE
   =========================================================== */
function FamilleDash({ user, router }: any) {
  return (
    <View>
      <LinearGradient colors={["#FED7AA", "#FCA5A5"]} style={styles.welcomeCard}>
        <View style={styles.welcomeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>Bonjour {user?.name?.split(" ")[0] || "Proche"} 🤝</Text>
            <Text style={styles.welcomeSub}>Restez connecté à vos proches mamans</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.widget}>
          <View style={styles.widgetHead}>
            <View style={styles.widgetTitleWrap}>
              <View style={[styles.widgetIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="people" size={18} color="#D97706" />
              </View>
              <Text style={styles.widgetTitle}>Famille connectée</Text>
            </View>
          </View>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginVertical: 8 }}>
            Rejoignez le groupe famille d'une maman avec un code de partage.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.push("/famille")}>
            <LinearGradient colors={["#F59E0B", "#EF4444"]} style={[styles.btn, { width: "100%" }]}>
              <Text style={[styles.btnText, { padding: 0 }]}>Accéder à mes familles</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Accès rapide</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="people-circle" label="Famille" onPress={() => router.push("/famille")} color="#F59E0B" />
          <QuickAction icon="chatbubbles" label="Messages" onPress={() => router.push("/(tabs)/messages")} color="#10B981" />
          <QuickAction icon="search" label="Centres" onPress={() => router.push("/centres")} color="#A855F7" />
          <QuickAction icon="settings" label="Profil" onPress={() => router.push("/(tabs)/profil")} color="#6B7280" />
        </View>
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, color }: any) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, testID, color = COLORS.primary }: any) {
  return (
    <TouchableOpacity style={styles.qa} onPress={onPress} testID={testID}>
      <View style={[styles.qaIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  loading: { flex: 1, backgroundColor: COLORS.bgPrimary, alignItems: "center", justifyContent: "center" },

  // Welcome card (gradient)
  welcomeCard: {
    margin: SPACING.lg,
    marginBottom: 0,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    ...SHADOW,
  },
  welcomeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  welcomeTitle: { fontSize: 20, fontWeight: "800", color: "#1F2937" },
  welcomeSub: { fontSize: 13, color: "#4B5563", marginTop: 2 },
  welcomeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  body: { padding: SPACING.lg, gap: SPACING.lg },

  // Hero (no grossesse)
  heroCard: {
    height: 190,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    position: "relative",
    ...SHADOW,
  },
  heroImg: { ...(StyleSheet.absoluteFillObject as any), width: "100%", height: "100%" },
  heroOverlay: { ...(StyleSheet.absoluteFillObject as any), backgroundColor: "rgba(45,51,47,0.45)" },
  heroContent: { flex: 1, padding: SPACING.lg, justifyContent: "flex-end" },
  heroLabel: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "800" },
  heroSub: { color: "#fff", fontSize: 13, opacity: 0.9, marginTop: 4, marginBottom: 12 },
  heroBtn: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  heroBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },

  // Section grossesse complète
  grossesseCard: { borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOW },
  grossesseHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  trimBadge: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  grossesseWeeks: { fontSize: 36, fontWeight: "800", color: "#1F2937", marginTop: 2 },
  grossesseSub: { fontSize: 12, color: "#374151", marginTop: 2 },
  progressRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingValue: { fontWeight: "800", color: "#1F2937", fontSize: 16 },
  progressBar: { height: 8, backgroundColor: "rgba(255,255,255,0.5)", borderRadius: 4, overflow: "hidden", marginBottom: 12 },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 4 },
  grossesseInfos: { flexDirection: "row", gap: 10, alignItems: "center" },
  grossesseInfoItem: { flex: 1 },
  grossesseInfoLabel: { fontSize: 10, color: "#374151", fontWeight: "700", letterSpacing: 1 },
  grossesseInfoValue: { fontSize: 14, color: "#1F2937", fontWeight: "800", marginTop: 2 },
  grossesseAction: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  grossesseActionText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  // Widgets
  sectionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "800", marginTop: 4 },
  widget: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW,
  },
  widgetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  widgetTitleWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  widgetIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  widgetTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "800" },
  linkText: { color: COLORS.primary, fontWeight: "600", fontSize: 12 },
  widgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  widgetRowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  widgetRowTitle: { color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
  widgetRowSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  statusBadge: {
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    textTransform: "uppercase",
  },
  emptyMini: { color: COLORS.textMuted, fontSize: 12, fontStyle: "italic", textAlign: "center", paddingVertical: 12 },

  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: "#FFFBEB",
    borderLeftWidth: 4,
    marginTop: 6,
  },
  alertText: { flex: 1, color: COLORS.textPrimary, fontSize: 12, fontWeight: "500" },

  childChip: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.md,
    padding: 12,
    alignItems: "center",
    marginRight: 10,
    minWidth: 90,
  },
  childEmoji: { fontSize: 32 },
  childName: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13, marginTop: 4 },
  childAge: { color: COLORS.textSecondary, fontSize: 11 },

  // Quick actions
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  qa: { width: "23%", alignItems: "center", gap: 6 },
  qaIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  qaLabel: { fontSize: 11, color: COLORS.textPrimary, fontWeight: "600", textAlign: "center" },

  // Pro / Admin
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricValue: { fontSize: 24, fontWeight: "800", color: COLORS.primary },
  metricLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "48%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: { width: 36, height: 36, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  btn: { paddingVertical: 14, borderRadius: RADIUS.pill, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
});
