import { useState, useCallback, useEffect, useRef } from "react";
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
  BackHandler,
  ToastAndroid,
  Platform,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { cachedGet } from "../../lib/offline";
import { useNotifications } from "../../lib/notifications-context";
import { COLORS, IMAGES, RADIUS, SHADOW, SPACING } from "../../constants/theme";
import { buildShareAppText } from "../../constants/links";

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const { unreadCount: unreadNotif, notifications } = useNotifications();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef<() => void>(() => {});

  // Bouton retour matériel Android : double-tap pour quitter l'app
  // (évite le saut vers une page blanche / Landing si l'historique est vide)
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      let lastBackPress = 0;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPress = now;
        try { ToastAndroid.show("Appuyez à nouveau pour quitter", ToastAndroid.SHORT); } catch {}
        return true; // bloque le retour par défaut
      });
      return () => sub.remove();
    }, [])
  );

  const loadUnread = async () => {
    // Géré globalement par NotificationsProvider — gardé en compat pour ne rien casser
  };

  const load = async () => {
    try {
      if (user?.role === "maman") {
        const [g, enfants, rdv, rem, demandes] = await Promise.all([
          cachedGet("/grossesse").catch(() => ({ data: null })),
          cachedGet("/enfants").catch(() => ({ data: [] })),
          cachedGet("/rdv").catch(() => ({ data: [] })),
          cachedGet("/reminders").catch(() => ({ data: [] })),
          api.get("/partage/demandes-recues").catch(() => ({ data: [] })),
        ]);
        setData({ grossesse: g.data, enfants: enfants.data, rdv: rdv.data, reminders: rem.data, demandes: demandes.data });
      } else if (user?.role === "professionnel") {
        const [patients, rdv] = await Promise.all([
          cachedGet("/pro/patients").catch(() => ({ data: [] })),
          cachedGet("/rdv").catch(() => ({ data: [] })),
        ]);
        setData({ patients: patients.data, rdv: rdv.data });
      } else if (user?.role === "centre_sante") {
        const [membres, rdv, centre] = await Promise.all([
          cachedGet("/centre/membres").catch(() => ({ data: [] })),
          cachedGet("/centre/rdv").catch(() => ({ data: [] })),
          cachedGet("/centres/mine").catch(() => ({ data: null })),
        ]);
        setData({ membres: membres.data, rdv: rdv.data, centre: centre.data });
      } else if (user?.role === "admin") {
        // Pour le super admin, on redirige vers le nouveau dashboard riche (onglet Admin)
        router.replace("/(tabs)/admin");
        return;
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); loadUnread(); }, [user]));

  // Garder une réf à load() pour les effets sans recréer l'effet à chaque render
  loadRef.current = load;

  // 🔔 Auto-rechargement quand une nouvelle notif arrive (ex : demande d'accès au dossier).
  // Le NotificationsProvider poll /notifications toutes les 30s ; on profite de ce signal.
  const lastReloadByNotifRef = useRef<number>(0);
  const lastNotifIdsRef = useRef<string>("");
  useEffect(() => {
    if (!user) return;
    if (user.role !== "maman" && user.role !== "professionnel") return;
    // Détecte les notifications "actionnables" (demande de dossier, RDV…)
    const actionable = notifications.filter((n) =>
      ["partage_demande", "partage_validee", "rdv_confirmation", "rdv_creation"].includes(n.type)
    );
    if (actionable.length === 0) return;
    // Signature courte pour détecter un changement (ajout d'une notif)
    const sig = actionable.map((n) => `${n.id}:${n.read ? 1 : 0}`).join("|");
    if (sig === lastNotifIdsRef.current) return;
    lastNotifIdsRef.current = sig;
    // Throttle 3s pour éviter rechargements en cascade
    const now = Date.now();
    if (now - lastReloadByNotifRef.current < 3000) return;
    lastReloadByNotifRef.current = now;
    loadRef.current();
  }, [notifications, user]);

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
        {user?.role === "maman" && <MamanDash user={user} data={data} router={router} unreadNotif={unreadNotif} />}
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
function MamanDash({ user, data, router, unreadNotif = 0 }: any) {
  const g = data.grossesse;
  const enfants = data.enfants || [];
  const rdvList = (data.rdv || []).filter((r: any) => r.status !== "termine" && r.statut !== "termine");
  const reminders = (data.reminders || []).filter((r: any) => !r.done).slice(0, 3);
  const documents = data.documents || [];

  // 🔐 Demandes d'accès pro au dossier médical — en attente et non expirées
  const demandesPending = (data.demandes || []).filter((d: any) => {
    if (d.status !== "pending") return false;
    if (!d.expires_at) return true;
    try { return new Date(d.expires_at).getTime() > Date.now(); } catch { return true; }
  });

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

  // 🎯 Score Santé : 5 facteurs × 20 pts
  const scoreFactors = {
    profil: !!(user?.name && user?.phone),
    suivi: !!g || enfants.length > 0,
    rdv: prochainsRDV.length > 0,
    dossier: documents.length > 0 || (g?.poids_initial && g?.taille) || enfants.some((e: any) => (e.vaccins || []).length > 0),
    consent: !!user?.consent_donnees_sante,
  };
  const scoreSante = Object.values(scoreFactors).filter(Boolean).length * 20;
  const scoreColor = scoreSante >= 80 ? "#10B981" : scoreSante >= 60 ? "#F59E0B" : "#EF4444";

  // 🎨 Favoris contextuels : 6 outils prioritaires selon le profil
  type Tool = { icon: string; label: string; route: string; color: string; key: string };
  const ALL_TOOLS: Record<string, Tool> = {
    rdv: { icon: "calendar", label: "RDV", route: "/(tabs)/rdv", color: "#EC4899", key: "rdv" },
    assistant: { icon: "sparkles", label: "Assistant IA", route: "/(tabs)/assistant", color: "#A855F7", key: "assistant" },
    cycle: { icon: "flower", label: "Cycle", route: "/cycle", color: "#E11D48", key: "cycle" },
    foetus: { icon: "heart", label: "Foetus S/S", route: "/foetus", color: "#F472B6", key: "foetus" },
    echo: { icon: "scan", label: "Échographie", route: "/tele-echo", color: "#8B5CF6", key: "echo" },
    plan_naissance: { icon: "clipboard", label: "Plan naissance", route: "/plan-naissance", color: "#EC4899", key: "plan_naissance" },
    enfants: { icon: "people", label: "Enfants", route: "/(tabs)/enfants", color: "#3B82F6", key: "enfants" },
    dmp: { icon: "pulse", label: "DMP — 7 axes", route: "/dmp", color: "#0EA5E9", key: "dmp" },
    diversification: { icon: "restaurant", label: "Diversification", route: "/diversification", color: "#F59E0B", key: "diversification" },
    activites: { icon: "game-controller", label: "Activités", route: "/activites", color: "#10B981", key: "activites" },
    contraception: { icon: "shield-checkmark", label: "Contraception", route: "/contraception", color: "#F59E0B", key: "contraception" },
    medecins: { icon: "medical", label: "Médecins", route: "/search", color: "#6366F1", key: "medecins" },
    dossier: { icon: "document-text", label: "Mon dossier", route: "/dossier-medical", color: "#14B8A6", key: "dossier" },
    cmu: { icon: "shield", label: "CMU", route: "/cmu", color: "#16A34A", key: "cmu" },
    naissance: { icon: "balloon", label: "Déclarer naissance", route: "/naissance", color: "#14B8A6", key: "naissance" },
  };

  // Choix contextuel des 6 favoris
  let favoritesKeys: string[];
  if (g) {
    // Enceinte
    if (trimestre === 1) favoritesKeys = ["assistant", "rdv", "foetus", "echo", "dossier", "medecins"];
    else if (trimestre === 2) favoritesKeys = ["rdv", "echo", "foetus", "assistant", "dossier", "diversification"];
    else favoritesKeys = ["rdv", "plan_naissance", "naissance", "echo", "assistant", "dossier"];
  } else if (enfants.length > 0) {
    // Maman avec enfants
    favoritesKeys = ["enfants", "dmp", "rdv", "diversification", "activites", "assistant"];
  } else {
    // Onboarding — ni grossesse ni enfants
    favoritesKeys = ["assistant", "cycle", "contraception", "medecins", "rdv", "cmu"];
  }
  const favorites = favoritesKeys.map((k) => ALL_TOOLS[k]).filter(Boolean);

  // Prochain RDV (1 seul, le plus proche)
  const prochainRDV = prochainsRDV[0];

  return (
    <View>
      {/* 🔴 BANNIÈRE URGENTE — Demande d'accès au dossier médical */}
      {demandesPending.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push("/partage-dossier")}
          style={styles.accessRequestBanner}
          testID="access-request-banner"
        >
          <LinearGradient
            colors={["#EF4444", "#DC2626"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accessRequestGradient}
          >
            <View style={styles.accessRequestIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accessRequestTitle}>
                🔐 {demandesPending.length} demande{demandesPending.length > 1 ? "s" : ""} d&apos;accès en attente
              </Text>
              <Text style={styles.accessRequestSub} numberOfLines={2}>
                Dr {demandesPending[0].pro_nom || "un professionnel"} souhaite consulter votre dossier.
              </Text>
            </View>
            <View style={styles.accessRequestCta}>
              <Text style={styles.accessRequestCtaText}>Valider</Text>
              <Ionicons name="chevron-forward" size={16} color="#DC2626" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* 👋 HEADER — Salutation + score santé + actions */}
      <View style={styles.heroV2}>
        <LinearGradient colors={["#FCE7F3", "#F3E8FF"]} style={styles.heroV2Gradient}>
          <View style={styles.heroV2Top}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroV2Hi}>Bonjour {user?.name?.split(" ")[0] || "Maman"} 👋</Text>
              <Text style={styles.heroV2Sub}>
                {g ? `${weeks} SA · Trimestre ${trimestre}` : enfants.length > 0 ? `${enfants.length} enfant${enfants.length > 1 ? "s" : ""} suivi${enfants.length > 1 ? "s" : ""}` : "Bienvenue dans À lo Maman"}
              </Text>
            </View>
            <View style={styles.heroV2Actions}>
              <TouchableOpacity style={styles.heroV2Btn} onPress={() => router.push("/(tabs)/profil")} testID="settings-btn">
                <Ionicons name="settings-outline" size={18} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroV2Btn} onPress={() => router.push("/notifications")} testID="notif-btn">
                <Ionicons name="notifications-outline" size={18} color={COLORS.textPrimary} />
                {unreadNotif > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{unreadNotif > 9 ? "9+" : unreadNotif}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Score santé compact */}
          <TouchableOpacity onPress={() => router.push("/(tabs)/profil")} style={styles.scoreCard}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreCircleText, { color: scoreColor }]}>{scoreSante}%</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scoreLabel}>Profil santé</Text>
              <Text style={styles.scoreSub}>
                {scoreSante === 100 ? "Parfait ! 🎉" : `${5 - Object.values(scoreFactors).filter(Boolean).length} étape${5 - Object.values(scoreFactors).filter(Boolean).length > 1 ? "s" : ""} pour le compléter`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        {/* 📅 SECTION : AUJOURD'HUI */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Aujourd&apos;hui</Text>
          <Text style={styles.sectionDate}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>

        {/* Suivi grossesse condensé */}
        {g && (
          <TouchableOpacity onPress={() => router.push("/(tabs)/grossesse")} testID="grossesse-card">
            <LinearGradient
              colors={trimestre === 1 ? ["#FCE7F3", "#FBCFE8"] : trimestre === 2 ? ["#F3E8FF", "#E9D5FF"] : ["#DBEAFE", "#BFDBFE"]}
              style={styles.todayCard}
            >
              <View style={styles.todayCardLeft}>
                <Text style={styles.todayBadge}>TRIMESTRE {trimestre}</Text>
                <Text style={styles.todayBigValue}>{weeks} SA</Text>
                <Text style={styles.todaySub}>
                  {dpa ? `DPA ${dpa.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${joursRestants} j restants` : "Bébé grandit chaque jour 💛"}
                </Text>
              </View>
              <View style={styles.progressRing}>
                <Text style={styles.progressRingValue}>{progression}%</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Prochain RDV */}
        {prochainRDV ? (
          <TouchableOpacity style={styles.todayMiniCard} onPress={() => router.push("/(tabs)/rdv")}>
            <View style={[styles.todayMiniIcon, { backgroundColor: "#FCE7F3" }]}>
              <Ionicons name="calendar" size={20} color="#EC4899" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayMiniLabel}>Prochain RDV</Text>
              <Text style={styles.todayMiniValue}>{prochainRDV.pro_name || "Professionnel"}</Text>
              <Text style={styles.todayMiniSub}>
                {new Date(prochainRDV.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            <View style={[styles.todayMiniStatus, { backgroundColor: prochainRDV.statut === "confirme" ? "#DCFCE7" : "#FEF3C7" }]}>
              <Text style={[styles.todayMiniStatusText, { color: prochainRDV.statut === "confirme" ? "#166534" : "#92400E" }]}>
                {prochainRDV.statut || prochainRDV.status || "en attente"}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.todayMiniCard, styles.todayMiniEmpty]} onPress={() => router.push("/(tabs)/rdv")}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.textMuted} />
            <Text style={styles.todayMiniEmptyText}>Aucun RDV à venir — prendre rendez-vous</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        {/* Rappels du jour (max 2) */}
        {reminders.slice(0, 2).map((r: any) => (
          <TouchableOpacity key={r.id} style={styles.todayMiniCard} onPress={() => router.push("/grossesse/rappels")}>
            <View style={[styles.todayMiniIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="alarm" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayMiniLabel}>Rappel</Text>
              <Text style={styles.todayMiniValue} numberOfLines={1}>{r.title}</Text>
              <Text style={styles.todayMiniSub}>
                {new Date(r.due_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Alertes IA si présentes */}
        {alertes.length > 0 && (
          <View style={styles.alertsBlock}>
            {alertes.map((a, i) => (
              <View key={i} style={[styles.alertChip, { borderLeftColor: a.color, backgroundColor: `${a.color}15` }]}>
                <Ionicons name="information-circle" size={16} color={a.color} />
                <Text style={[styles.alertChipText, { color: a.color }]}>{a.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 👶 SECTION ENFANTS */}
        {enfants.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleV2}>Mes enfants</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/enfants")}>
                <Text style={styles.linkText}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {enfants.map((e: any) => {
                const ageMois = Math.floor((Date.now() - new Date(e.date_naissance).getTime()) / (30.4375 * 86400000));
                const ageLabel = ageMois < 12 ? `${ageMois} mois` : `${Math.floor(ageMois / 12)} an${Math.floor(ageMois / 12) > 1 ? "s" : ""}`;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.childCardV2}
                    onPress={() => router.push(`/dmp/${e.id}`)}
                    testID={`child-card-${e.id}`}
                  >
                    <Text style={styles.childEmojiV2}>{e.sexe === "F" ? "👧" : "👦"}</Text>
                    <Text style={styles.childNameV2} numberOfLines={1}>{e.nom || e.prenom}</Text>
                    <Text style={styles.childAgeV2}>{ageLabel}</Text>
                    <View style={styles.childCta}>
                      <Ionicons name="pulse" size={11} color="#0EA5E9" />
                      <Text style={styles.childCtaText}>DMP</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* 🎯 SECTION OUTILS ESSENTIELS — 6 favoris contextuels */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Outils essentiels</Text>
          <TouchableOpacity onPress={() => router.push("/mon-espace-sante")} testID="link-tous-outils-maman">
            <Text style={styles.linkText}>Tous les outils →</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.favGrid}>
          {favorites.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={styles.favCard}
              onPress={() => router.push(f.route as any)}
              testID={`fav-${f.key}`}
            >
              <View style={[styles.favIcon, { backgroundColor: `${f.color}22` }]}>
                <Ionicons name={f.icon as any} size={22} color={f.color} />
              </View>
              <Text style={styles.favLabel}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 🎁 SECTION CONNECT — Communauté + Famille + Premium */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Communauté</Text>
        </View>
        <View style={{ gap: 8 }}>
          <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/(tabs)/communaute")}>
            <View style={[styles.connectIcon, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="chatbubbles" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Communauté</Text>
              <Text style={styles.connectSub}>Échanger avec d&apos;autres mamans</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/famille")}>
            <View style={[styles.connectIcon, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="people-circle" size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Mon cercle famille</Text>
              <Text style={styles.connectSub}>Inviter le papa et les proches</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/parrainage")}>
            <View style={[styles.connectIcon, { backgroundColor: "#FCE7F3" }]}>
              <Ionicons name="gift" size={20} color="#DB2777" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Parrainez et gagnez</Text>
              <Text style={styles.connectSub}>+7 jours Premium par filleule invitée</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
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
  const rdvAll = data.rdv || [];
  const today = new Date();
  const todayStr = today.toDateString();
  const weekFromNow = new Date(today.getTime() + 7 * 86400000);

  const rdvToday = rdvAll.filter((r: any) => {
    try { return new Date(r.date).toDateString() === todayStr; } catch { return false; }
  });
  const rdvWeek = rdvAll.filter((r: any) => {
    try { const d = new Date(r.date); return d >= today && d <= weekFromNow; } catch { return false; }
  });

  // 📨 Messagerie : total non-lus + patientes avec non-lus
  const patientsUnread = patients.filter((p: any) => (p.unread_count || 0) > 0);
  const totalUnread = patients.reduce((s: number, p: any) => s + (p.unread_count || 0), 0);

  // 📊 Score d'activité : 4 facteurs × 25 pts
  const scoreFactors = {
    rdv_today: rdvToday.length > 0,
    patients: patients.length > 0,
    messages_actif: totalUnread === 0 || patientsUnread.length < 3,  // pas trop de retard
    profil: !!(user?.specialite && user?.phone),
  };
  const scoreActivite = Object.values(scoreFactors).filter(Boolean).length * 25;
  const scoreColor = scoreActivite >= 75 ? "#10B981" : scoreActivite >= 50 ? "#F59E0B" : "#EF4444";

  // 🎨 6 favoris pros essentiels
  const favorites = [
    { icon: "people", label: "Patientes", route: "/(tabs)/patients", color: "#2DD4BF", badge: patientsUnread.length },
    { icon: "calendar", label: "Agenda", route: "/pro/disponibilites", color: "#06B6D4", badge: 0 },
    { icon: "chatbubbles", label: "Messages", route: "/(tabs)/messages", color: "#3B82F6", badge: totalUnread },
    { icon: "sparkles", label: "IA Pro", route: "/pro/ia", color: "#A855F7", badge: 0 },
    { icon: "videocam", label: "Téléconsult.", route: "/(tabs)/rdv", color: "#EC4899", badge: 0 },
    { icon: "alarm", label: "Rappels", route: "/pro/rappels", color: "#F59E0B", badge: 0 },
  ];

  // Partage du lien Play Store aux patientes / collègues
  const inviterPatientes = async () => {
    const intro = `Bonjour,\n\nJe suis Dr ${user?.name || ""} et j'utilise l'application *À lo Maman* pour accompagner mes patientes enceintes et leurs enfants.\n\nTéléchargez gratuitement l'application pour :\n• Suivre votre grossesse semaine par semaine\n• Partager votre dossier avec moi en toute sécurité\n• Recevoir mes conseils et rappels personnalisés\n• Prendre RDV en quelques clics`;
    const msg = buildShareAppText(intro);
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(msg);
        Alert.alert("✓ Message copié", "Collez-le dans WhatsApp, SMS, e-mail… pour inviter vos patientes.");
      } else {
        await Share.share({ message: msg, title: "Inviter mes patientes sur À lo Maman" });
      }
    } catch {}
  };

  const proName = user?.name?.split(" ").slice(-1)[0] || "Pro";
  const nextRdv = rdvAll
    .filter((r: any) => { try { return new Date(r.date) >= today; } catch { return false; } })
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  return (
    <View>
      {/* 👋 HEADER PRO — Salutation + score activité */}
      <View style={styles.heroV2}>
        <LinearGradient colors={["#DBEAFE", "#E0F2FE"]} style={styles.heroV2Gradient}>
          <View style={styles.heroV2Top}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroV2Hi, { color: "#1E3A8A" }]}>Bonjour Dr. {proName} 🩺</Text>
              <Text style={[styles.heroV2Sub, { color: "#1E40AF" }]}>
                {user?.specialite || "Professionnel de santé"} · {patients.length} patiente{patients.length > 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.heroV2Actions}>
              <TouchableOpacity style={styles.heroV2Btn} onPress={() => router.push("/(tabs)/profil")} testID="settings-btn">
                <Ionicons name="settings-outline" size={18} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroV2Btn} onPress={() => router.push("/notifications")} testID="notif-btn">
                <Ionicons name="notifications-outline" size={18} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Score activité compact */}
          <TouchableOpacity onPress={() => router.push("/(tabs)/profil")} style={styles.scoreCard}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreCircleText, { color: scoreColor }]}>{scoreActivite}%</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scoreLabel}>Activité du cabinet</Text>
              <Text style={styles.scoreSub}>
                {scoreActivite === 100 ? "Excellent niveau d'activité 🎉" : `${4 - Object.values(scoreFactors).filter(Boolean).length} levier${4 - Object.values(scoreFactors).filter(Boolean).length > 1 ? "s" : ""} à actionner`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        {/* 📅 SECTION : AUJOURD'HUI */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Aujourd&apos;hui</Text>
          <Text style={styles.sectionDate}>
            {today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>

        {/* Card RDV du jour */}
        <TouchableOpacity onPress={() => router.push("/(tabs)/rdv")} testID="rdv-today-card">
          <LinearGradient
            colors={rdvToday.length > 0 ? ["#DBEAFE", "#BFDBFE"] : ["#F3F4F6", "#E5E7EB"]}
            style={styles.todayCard}
          >
            <View style={styles.todayCardLeft}>
              <Text style={[styles.todayBadge, { color: "#1E40AF" }]}>RDV DU JOUR</Text>
              <Text style={styles.todayBigValue}>{rdvToday.length}</Text>
              <Text style={styles.todaySub}>
                {rdvToday.length === 0 ? "Aucun RDV aujourd'hui" : rdvToday.length === 1 ? "1 patient à recevoir" : `${rdvToday.length} patientes à recevoir`}
              </Text>
            </View>
            <View style={[styles.progressRing, { backgroundColor: "#1E40AF" }]}>
              <Ionicons name="calendar" size={26} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Liste des RDV du jour (max 3) */}
        {rdvToday.slice(0, 3).map((r: any) => (
          <TouchableOpacity key={r.id} style={styles.todayMiniCard} onPress={() => router.push("/(tabs)/rdv")}>
            <View style={[styles.todayMiniIcon, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="time" size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayMiniLabel}>
                {new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={styles.todayMiniValue}>{r.maman_name || "Patiente"}</Text>
              <Text style={styles.todayMiniSub} numberOfLines={1}>{r.motif || "Consultation"}</Text>
            </View>
            <View style={[styles.todayMiniStatus, { backgroundColor: r.statut === "confirme" ? "#DCFCE7" : "#FEF3C7" }]}>
              <Text style={[styles.todayMiniStatusText, { color: r.statut === "confirme" ? "#166534" : "#92400E" }]}>
                {r.statut || "en attente"}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Prochain RDV si pas aujourd'hui */}
        {rdvToday.length === 0 && nextRdv && (
          <TouchableOpacity style={styles.todayMiniCard} onPress={() => router.push("/(tabs)/rdv")}>
            <View style={[styles.todayMiniIcon, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="calendar-outline" size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayMiniLabel}>Prochain RDV</Text>
              <Text style={styles.todayMiniValue}>{nextRdv.maman_name || "Patiente"}</Text>
              <Text style={styles.todayMiniSub}>
                {new Date(nextRdv.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}

        {/* Card Messages non lus si applicable */}
        {totalUnread > 0 && (
          <TouchableOpacity style={styles.todayMiniCard} onPress={() => router.push("/(tabs)/messages")}>
            <View style={[styles.todayMiniIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="mail-unread" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayMiniLabel}>Messages non lus</Text>
              <Text style={styles.todayMiniValue}>
                {totalUnread} message{totalUnread > 1 ? "s" : ""} de {patientsUnread.length} patiente{patientsUnread.length > 1 ? "s" : ""}
              </Text>
              <Text style={styles.todayMiniSub} numberOfLines={1}>
                {patientsUnread[0]?.last_message || "Toucher pour répondre"}
              </Text>
            </View>
            <View style={[styles.todayMiniStatus, { backgroundColor: "#DC2626" }]}>
              <Text style={[styles.todayMiniStatusText, { color: "#fff" }]}>{totalUnread}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 📊 SECTION STATISTIQUES */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Mes statistiques</Text>
        </View>
        <View style={styles.metricsRowV2}>
          <View style={styles.metricCardV2}>
            <Text style={[styles.metricValueV2, { color: "#3B82F6" }]}>{patients.length}</Text>
            <Text style={styles.metricLabelV2}>Patientes</Text>
          </View>
          <View style={styles.metricCardV2}>
            <Text style={[styles.metricValueV2, { color: "#10B981" }]}>{rdvWeek.length}</Text>
            <Text style={styles.metricLabelV2}>Cette semaine</Text>
          </View>
          <View style={styles.metricCardV2}>
            <Text style={[styles.metricValueV2, { color: "#A855F7" }]}>{rdvAll.length}</Text>
            <Text style={styles.metricLabelV2}>RDV Total</Text>
          </View>
        </View>

        {/* 🎯 SECTION OUTILS ESSENTIELS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Outils essentiels</Text>
          <TouchableOpacity onPress={() => router.push("/pro/mon-espace-pro")} testID="link-tous-outils-pro">
            <Text style={styles.linkText}>Tous les outils →</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.favGrid}>
          {favorites.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={styles.favCard}
              onPress={() => router.push(f.route as any)}
              testID={`fav-${f.label}`}
            >
              <View style={[styles.favIcon, { backgroundColor: `${f.color}22` }]}>
                <Ionicons name={f.icon as any} size={22} color={f.color} />
                {f.badge > 0 && (
                  <View style={styles.favBadge}>
                    <Text style={styles.favBadgeText}>{f.badge > 9 ? "9+" : f.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.favLabel}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 🎁 SECTION CONNECT */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleV2}>Plus</Text>
        </View>
        <View style={{ gap: 8 }}>
          <TouchableOpacity style={styles.connectCard} onPress={inviterPatientes}>
            <View style={[styles.connectIcon, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="share-social" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Inviter mes patientes</Text>
              <Text style={styles.connectSub}>Partager le lien Google Play personnalisé</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/(tabs)/communaute")}>
            <View style={[styles.connectIcon, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="chatbubbles-outline" size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Communauté pro</Text>
              <Text style={styles.connectSub}>Échanger avec d&apos;autres soignants</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/premium")}>
            <View style={[styles.connectIcon, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="diamond" size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Passer Premium</Text>
              <Text style={styles.connectSub}>Patientes illimitées · IA avancée · Statistiques</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
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

        <Text style={styles.sectionTitle}>Console Admin</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="people" label="Utilisateurs" onPress={() => router.push("/(tabs)/admin")} color="#C85A40" />
          <QuickAction icon="analytics" label="Analytics" onPress={() => router.push("/admin/analytics")} color="#3B82F6" />
          <QuickAction icon="document-text" label="Audit" onPress={() => router.push("/admin/audit")} color="#A855F7" />
          <QuickAction icon="business" label="Centres" onPress={() => router.push("/centres")} color="#10B981" />
          <QuickAction icon="chatbubbles-outline" label="Communauté" onPress={() => router.push("/(tabs)/communaute")} color="#F59E0B" />
          <QuickAction icon="diamond" label="Premium" onPress={() => router.push("/premium")} color="#F59E0B" />
        </View>
      </View>
    </View>
  );
}

/* ===========================================================
   DASHBOARD CENTRE DE SANTÉ
   =========================================================== */
function CentreDash({ user, router }: any) {
  const centreName = user?.name || "Centre";
  const [centre, setCentre] = useState<any>(null);
  const [stats, setStats] = useState<{ pros: any[]; patientes: any[] }>({ pros: [], patientes: [] });

  // Partage du lien Play Store aux patientes/pros
  const inviter = async () => {
    const intro = `Bonjour,\n\nLe centre *${centre?.nom_centre || centreName}* vous invite à rejoindre l'application *À lo Maman*, votre compagnon santé maternelle et pédiatrique.\n\n✓ Suivi grossesse semaine par semaine\n✓ Carnet de santé enfants\n✓ Téléconsultations & RDV en ligne\n✓ Assistant IA & communauté\n✓ Intégration CMU & remboursements`;
    const msg = buildShareAppText(intro);
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(msg);
        Alert.alert("✓ Message copié", "Collez-le sur WhatsApp, SMS ou e-mail pour inviter vos patientes et pros.");
      } else {
        await Share.share({ message: msg, title: "Inviter sur À lo Maman" });
      }
    } catch {}
  };

  const partagerCode = async () => {
    if (!centre?.code_invitation) return;
    const msg = `Code d'invitation au centre *${centre.nom_centre || centreName}* sur À lo Maman :\n\n  ${centre.code_invitation}  \n\nUtilisez ce code à l'inscription pour rejoindre notre équipe.`;
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(msg);
        Alert.alert("✓ Code copié", "Le code et les instructions ont été copiés.");
      } else {
        await Share.share({ message: msg });
      }
    } catch {}
  };

  const loadAll = async () => {
    try {
      const [cRes, ctcRes] = await Promise.all([
        api.get("/centres/mine").catch(() => ({ data: null })),
        api.get("/centre/contacts").catch(() => ({ data: { pros: [], patientes: [] } })),
      ]);
      setCentre(cRes.data);
      setStats(ctcRes.data || { pros: [], patientes: [] });
    } catch {
      setCentre(null);
    }
  };
  useFocusEffect(useCallback(() => { loadAll(); }, []));

  // 📨 Compteurs messagerie
  const totalUnread =
    stats.pros.reduce((s, p: any) => s + (p.unread_count || 0), 0) +
    stats.patientes.reduce((s, p: any) => s + (p.unread_count || 0), 0);
  const prosUnread = stats.pros.filter((p: any) => (p.unread_count || 0) > 0).length;
  const patientesUnread = stats.patientes.filter((p: any) => (p.unread_count || 0) > 0).length;

  // 📊 Score de santé du centre — 4 facteurs × 25 pts
  const scoreFactors = {
    pros: stats.pros.length > 0,
    patientes: stats.patientes.length > 0,
    profil: !!(centre?.adresse && centre?.email_contact),
    tarifs: !!centre?.tarifs_count, // remplir si collection tarifs vide
  };
  const scoreCentre = Object.values(scoreFactors).filter(Boolean).length * 25;
  const scoreColor = scoreCentre >= 75 ? "#10B981" : scoreCentre >= 50 ? "#F59E0B" : "#EF4444";

  // 🎨 6 favoris essentiels du centre
  const favorites = [
    { icon: "people", label: "Pros", route: "/(tabs)/patients", color: "#A855F7", badge: prosUnread },
    { icon: "heart", label: "Patientes", route: "/(tabs)/patientes", color: "#EC4899", badge: patientesUnread },
    { icon: "calendar", label: "Agenda", route: "/centre/calendrier", color: "#3B82F6", badge: 0 },
    { icon: "pricetag", label: "Tarifs", route: "/centre/tarifs", color: "#10B981", badge: 0 },
    { icon: "chatbubbles", label: "Messages", route: "/(tabs)/messages", color: "#0EA5E9", badge: totalUnread },
    { icon: "sparkles", label: "Assistant", route: "/(tabs)/assistant", color: "#F59E0B", badge: 0 },
  ];

  return (
    <View>
      {/* 👋 HEADER CENTRE — Salutation + score + actions */}
      <View style={styles.heroV2}>
        <LinearGradient colors={["#F3E8FF", "#E0E7FF"]} style={styles.heroV2Gradient}>
          <View style={styles.heroV2Top}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroV2Hi, { color: "#4C1D95" }]}>
                {centre?.nom_centre || centreName} 🏥
              </Text>
              <Text style={[styles.heroV2Sub, { color: "#5B21B6" }]}>
                {centre?.type_etablissement || "Centre de santé"}
                {centre?.ville ? ` · ${centre.ville}` : ""}
              </Text>
            </View>
            <View style={styles.heroV2Actions}>
              <TouchableOpacity style={styles.heroV2Btn} onPress={() => router.push("/(tabs)/profil")}>
                <Ionicons name="settings-outline" size={18} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroV2Btn} onPress={() => router.push("/notifications")}>
                <Ionicons name="notifications-outline" size={18} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={() => router.push("/(tabs)/profil")} style={styles.scoreCard}>
            <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreCircleText, { color: scoreColor }]}>{scoreCentre}%</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scoreLabel}>Configuration du centre</Text>
              <Text style={styles.scoreSub}>
                {scoreCentre === 100 ? "Centre opérationnel ✓" : `${4 - Object.values(scoreFactors).filter(Boolean).length} étape${4 - Object.values(scoreFactors).filter(Boolean).length > 1 ? "s" : ""} à compléter`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </LinearGradient>
      </View>

      <View style={styles.body}>
        {!centre ? (
          <View style={styles.todayMiniCard}>
            <Ionicons name="warning" size={22} color="#EF4444" />
            <Text style={{ flex: 1, color: COLORS.textSecondary }}>
              Centre non trouvé. Recréez votre profil ou contactez le support.
            </Text>
          </View>
        ) : (
          <>
            {/* 🔑 SECTION : MON CENTRE — Code d'invitation */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleV2}>Code d&apos;invitation</Text>
              <TouchableOpacity onPress={partagerCode}>
                <Text style={styles.linkText}>Partager →</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={partagerCode} testID="centre-code-card">
              <LinearGradient colors={["#F3E8FF", "#E9D5FF"]} style={styles.todayCard}>
                <View style={styles.todayCardLeft}>
                  <Text style={[styles.todayBadge, { color: "#6B21A8" }]}>POUR LES PROS</Text>
                  <Text style={[styles.todayBigValue, { fontSize: 24, color: "#6B21A8", letterSpacing: 4, marginTop: 6 }]}>
                    {centre.code_invitation}
                  </Text>
                  <Text style={styles.todaySub}>
                    Partagez avec vos médecins pour qu&apos;ils rejoignent
                  </Text>
                </View>
                <View style={[styles.progressRing, { backgroundColor: "#A855F7" }]}>
                  <Ionicons name="key" size={26} color="#fff" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Card "Messages non lus" si applicable */}
            {totalUnread > 0 && (
              <TouchableOpacity style={styles.todayMiniCard} onPress={() => router.push("/(tabs)/messages")}>
                <View style={[styles.todayMiniIcon, { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons name="mail-unread" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayMiniLabel}>Messages non lus</Text>
                  <Text style={styles.todayMiniValue}>
                    {totalUnread} message{totalUnread > 1 ? "s" : ""}
                  </Text>
                  <Text style={styles.todayMiniSub} numberOfLines={1}>
                    {prosUnread > 0 && `${prosUnread} pro${prosUnread > 1 ? "s" : ""}`}
                    {prosUnread > 0 && patientesUnread > 0 && " · "}
                    {patientesUnread > 0 && `${patientesUnread} patiente${patientesUnread > 1 ? "s" : ""}`}
                  </Text>
                </View>
                <View style={[styles.todayMiniStatus, { backgroundColor: "#DC2626" }]}>
                  <Text style={[styles.todayMiniStatusText, { color: "#fff" }]}>{totalUnread}</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Card adresse / contact si renseigné */}
            {(centre.adresse || centre.email_contact) && (
              <TouchableOpacity style={styles.todayMiniCard} onPress={() => router.push("/(tabs)/profil")}>
                <View style={[styles.todayMiniIcon, { backgroundColor: "#F3E8FF" }]}>
                  <Ionicons name="business" size={20} color="#7E22CE" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayMiniLabel}>Mon centre</Text>
                  <Text style={styles.todayMiniValue} numberOfLines={1}>
                    {centre.adresse || centre.email_contact}
                  </Text>
                  {centre.ville && centre.region && (
                    <Text style={styles.todayMiniSub}>{centre.ville} · {centre.region}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}

            {/* 📊 SECTION STATISTIQUES */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleV2}>Mon réseau</Text>
            </View>
            <View style={styles.metricsRowV2}>
              <View style={styles.metricCardV2}>
                <Text style={[styles.metricValueV2, { color: "#A855F7" }]}>{stats.pros.length}</Text>
                <Text style={styles.metricLabelV2}>Pros</Text>
              </View>
              <View style={styles.metricCardV2}>
                <Text style={[styles.metricValueV2, { color: "#EC4899" }]}>{stats.patientes.length}</Text>
                <Text style={styles.metricLabelV2}>Patientes</Text>
              </View>
              <View style={styles.metricCardV2}>
                <Text style={[styles.metricValueV2, { color: "#3B82F6" }]}>
                  {stats.patientes.filter((p: any) => p.has_grossesse).length}
                </Text>
                <Text style={styles.metricLabelV2}>Grossesses</Text>
              </View>
            </View>

            {/* 🎯 SECTION OUTILS ESSENTIELS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleV2}>Outils essentiels</Text>
              <TouchableOpacity onPress={() => router.push("/centre/mon-espace-centre")} testID="link-tous-outils-centre">
                <Text style={styles.linkText}>Tous les outils →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.favGrid}>
              {favorites.map((f) => (
                <TouchableOpacity
                  key={f.label}
                  style={styles.favCard}
                  onPress={() => router.push(f.route as any)}
                  testID={`fav-${f.label}`}
                >
                  <View style={[styles.favIcon, { backgroundColor: `${f.color}22` }]}>
                    <Ionicons name={f.icon as any} size={22} color={f.color} />
                    {f.badge > 0 && (
                      <View style={styles.favBadge}>
                        <Text style={styles.favBadgeText}>{f.badge > 9 ? "9+" : f.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.favLabel}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 🎁 SECTION PLUS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleV2}>Plus</Text>
            </View>
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={styles.connectCard} onPress={inviter}>
                <View style={[styles.connectIcon, { backgroundColor: "#D1FAE5" }]}>
                  <Ionicons name="share-social" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.connectTitle}>Inviter sur À lo Maman</Text>
                  <Text style={styles.connectSub}>Partager le lien Google Play personnalisé</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/(tabs)/communaute")}>
                <View style={[styles.connectIcon, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="chatbubbles-outline" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.connectTitle}>Communauté</Text>
                  <Text style={styles.connectSub}>Échanger avec d&apos;autres centres</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.connectCard} onPress={() => router.push("/premium")}>
                <View style={[styles.connectIcon, { backgroundColor: "#FCE7F3" }]}>
                  <Ionicons name="diamond" size={20} color="#DB2777" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.connectTitle}>Passer Premium</Text>
                  <Text style={styles.connectSub}>Pros illimités · Statistiques avancées · API</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </>
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

  // 🔐 Bannière urgente — Demande d'accès au dossier médical (pro → maman)
  accessRequestBanner: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: 8,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    ...SHADOW,
  },
  accessRequestGradient: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  accessRequestIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  accessRequestTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  accessRequestSub: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 3, lineHeight: 16 },
  accessRequestCta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  accessRequestCtaText: { color: "#DC2626", fontWeight: "800", fontSize: 12 },

  // 👋 Hero V2 — Salutation + score santé
  heroV2: { marginHorizontal: SPACING.lg, marginTop: SPACING.lg, borderRadius: RADIUS.xl, overflow: "hidden", ...SHADOW },
  heroV2Gradient: { padding: SPACING.lg },
  heroV2Top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  heroV2Hi: { fontSize: 20, fontWeight: "800", color: "#831843" },
  heroV2Sub: { fontSize: 12, color: "#9D174D", marginTop: 2 },
  heroV2Actions: { flexDirection: "row", gap: 8 },
  heroV2Btn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center", position: "relative" },
  notifBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 1.5, borderColor: "#fff" },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: RADIUS.md },
  scoreCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  scoreCircleText: { fontSize: 14, fontWeight: "900" },
  scoreLabel: { fontSize: 13, fontWeight: "800", color: COLORS.textPrimary },
  scoreSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  // Section headers V2
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 },
  sectionTitleV2: { fontSize: 16, fontWeight: "800", color: COLORS.textPrimary },
  sectionDate: { fontSize: 11, color: COLORS.textMuted, fontWeight: "600", textTransform: "capitalize" },

  // Aujourd'hui — gros bloc (grossesse)
  todayCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: RADIUS.lg, marginBottom: 10 },
  todayCardLeft: { flex: 1 },
  todayBadge: { fontSize: 10, fontWeight: "800", color: "#7E22CE", letterSpacing: 1 },
  todayBigValue: { fontSize: 28, fontWeight: "900", color: COLORS.textPrimary, marginTop: 4 },
  todaySub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },

  // Aujourd'hui — mini cards (RDV, rappels)
  todayMiniCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  todayMiniIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  todayMiniLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  todayMiniValue: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary, marginTop: 2 },
  todayMiniSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  todayMiniStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  todayMiniStatusText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  todayMiniEmpty: { borderStyle: "dashed", justifyContent: "space-between" },
  todayMiniEmptyText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 },

  // Alertes condensées
  alertsBlock: { gap: 6, marginBottom: 8 },
  alertChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderLeftWidth: 3 },
  alertChipText: { flex: 1, fontSize: 12, fontWeight: "600" },

  // Mes enfants V2
  childCardV2: { width: 110, padding: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  childEmojiV2: { fontSize: 32 },
  childNameV2: { fontSize: 12, fontWeight: "700", color: COLORS.textPrimary, marginTop: 4 },
  childAgeV2: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  childCta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8, backgroundColor: "#E0F2FE", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  childCtaText: { fontSize: 9, fontWeight: "800", color: "#0369A1" },

  // Outils essentiels (favoris)
  favGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  favCard: { width: "31%", aspectRatio: 1, padding: 10, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", gap: 8 },
  favIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  favLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textPrimary, textAlign: "center" },

  // Connect cards (communauté, famille, parrainage)
  connectCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  connectIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  connectTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  connectSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Liens "Voir tout / Tous les outils"
  linkText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  // Progress ring (grossesse %, RDV count, etc.)
  progressRing: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.7)" },
  progressRingValue: { fontSize: 14, fontWeight: "900", color: COLORS.textPrimary },

  // Métriques V2 (3 chiffres clés pour le pro)
  metricsRowV2: { flexDirection: "row", gap: 10 },
  metricCardV2: { flex: 1, padding: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  metricValueV2: { fontSize: 26, fontWeight: "900" },
  metricLabelV2: { fontSize: 11, fontWeight: "700", color: COLORS.textSecondary, marginTop: 4, textAlign: "center" },

  // Badge sur favori (compteur non-lus, alertes...)
  favBadge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#EF4444", paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  favBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

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
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  notifBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
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
